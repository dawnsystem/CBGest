import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { AppSettings } from '../types';
import { loadPersistedState } from '../utils/stateStorage';
import { createDefaultSettings } from '../config/defaultSettings';
import { redactSettingsForLocalStorage } from '../utils/settingsLocalStorage';
import * as appwriteService from '../services/appwriteService';

interface UseAppSettingsReturn {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  handleUpdateSettings: (newSettings: AppSettings) => Promise<void>;
  /** Mutable ref kept in sync with `settings` — safe to read inside effects without adding it as a dep. */
  settingsRef: MutableRefObject<AppSettings>;
  /** Default settings ref — used to guard against missing arrays on re-sync. */
  defaultSettingsRef: MutableRefObject<AppSettings>;
}

/**
 * Manages application settings state, local-storage persistence and Appwrite sync.
 *
 * Extracted from App.tsx to reduce its surface area.  All settings-related state
 * and side-effects live here; App.tsx only consumes the returned values.
 *
 * @param user - Current authenticated user (used to re-sync settings on login/logout).
 * @param isLocalFileMode - When true the localStorage persistence effect is suppressed.
 */
export function useAppSettings(
  user: { $id: string; name: string } | null,
  isLocalFileMode: boolean
): UseAppSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadPersistedState('gestcb_settings', createDefaultSettings())
  );

  const settingsRef = useRef(settings);
  const defaultSettingsRef = useRef(createDefaultSettings());

  // Keep ref in sync so effects can read the latest value without needing it as a dep.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Re-hydrate from localStorage when the authenticated user changes (BUG-029).
  // Always apply partner defaults if missing; do not discard partner fixes when dataConfig is unchanged.
  useEffect(() => {
    const freshSettings = loadPersistedState<AppSettings>('gestcb_settings', settingsRef.current);
    let changed = false;

    if (!Array.isArray(freshSettings.partners) || freshSettings.partners.length === 0) {
      freshSettings.partners = defaultSettingsRef.current.partners;
      changed = true;
    }

    if (
      JSON.stringify(freshSettings.dataConfig) !== JSON.stringify(settingsRef.current.dataConfig)
    ) {
      changed = true;
    }

    if (changed || JSON.stringify(freshSettings) !== JSON.stringify(settingsRef.current)) {
      setSettings(freshSettings);
    }
  }, [user]);

  // Persist settings to localStorage on every change (unless in encrypted file mode).
  useEffect(() => {
    if (!isLocalFileMode) {
      localStorage.setItem('gestcb_settings', JSON.stringify(redactSettingsForLocalStorage(settings)));
    }
  }, [settings, isLocalFileMode]);

  /**
   * Actualiza settings en estado + LS y sincroniza con Appwrite.
   * Si Appwrite falla, revierte estado y LS al valor previo (BUG-030).
   *
   * @param newSettings - Nueva configuración
   * @throws Error de sync Appwrite tras revertir (para que la UI muestre toast)
   */
  const handleUpdateSettings = async (newSettings: AppSettings): Promise<void> => {
    const previous = settingsRef.current;
    setSettings(newSettings);
    localStorage.setItem('gestcb_settings', JSON.stringify(redactSettingsForLocalStorage(newSettings)));

    if (newSettings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.saveSettings(newSettings);
        const merged: AppSettings = {
          ...saved,
          dataConfig: newSettings.dataConfig,
          partners: saved.partners?.length ? saved.partners : newSettings.partners,
          aiConfig: saved.aiConfig ?? newSettings.aiConfig,
        };
        setSettings(merged);
        localStorage.setItem('gestcb_settings', JSON.stringify(merged));
        console.warn('✅ Settings sincronizados con Appwrite');
      } catch (error) {
        console.error('Error syncing settings to Appwrite:', error);
        setSettings(previous);
        localStorage.setItem('gestcb_settings', JSON.stringify(previous));
        throw error;
      }
    }
  };

  return { settings, setSettings, handleUpdateSettings, settingsRef, defaultSettingsRef };
}
