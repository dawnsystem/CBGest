import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { AppSettings } from '../types';
import { loadPersistedState } from '../utils/stateStorage';
import { createDefaultSettings } from '../config/defaultSettings';
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

  // Re-read settings from localStorage whenever the authenticated user changes.
  // This picks up any changes written by the Login component before App mounts.
  useEffect(() => {
    const freshSettings = loadPersistedState<AppSettings>('gestcb_settings', settingsRef.current);

    if (!freshSettings.partners) {
      freshSettings.partners = defaultSettingsRef.current.partners;
    }

    if (JSON.stringify(freshSettings.dataConfig) !== JSON.stringify(settingsRef.current.dataConfig)) {
      setSettings(freshSettings);
    }
  }, [user]);

  // Persist settings to localStorage on every change (unless in encrypted file mode).
  useEffect(() => {
    if (!isLocalFileMode) {
      localStorage.setItem('gestcb_settings', JSON.stringify(settings));
    }
  }, [settings, isLocalFileMode]);

  const handleUpdateSettings = async (newSettings: AppSettings): Promise<void> => {
    setSettings(newSettings);
    localStorage.setItem('gestcb_settings', JSON.stringify(newSettings));

    if (newSettings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.saveSettings(newSettings);
        console.log('✅ Settings sincronizados con Appwrite');
      } catch (error) {
        console.error('Error syncing settings to Appwrite:', error);
      }
    }
  };

  return { settings, setSettings, handleUpdateSettings, settingsRef, defaultSettingsRef };
}
