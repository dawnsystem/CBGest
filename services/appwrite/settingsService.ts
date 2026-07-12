/**
 * @fileoverview Servicio de configuración para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  withRetry,
  notifyError,
  setConnectionHealth,
} from './infrastructure';
import type { AppSettings } from '../../types';

type SettingsDocument = AppwriteEntity<AppSettings> & { $id?: string; partners?: string | AppSettings['partners'] };

const parsePartners = (partners: SettingsDocument['partners']): AppSettings['partners'] => {
  if (typeof partners === 'string') {
    try {
      return JSON.parse(partners || '[]') as AppSettings['partners'];
    } catch (e) {
      console.warn('parsePartners: invalid JSON in partners field, falling back to []', e);
      return [];
    }
  }
  return partners || [];
};

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.settings, [Query.limit(1)]),
      'getSettingsForSave'
    );

    const { dataConfig, partners, ...restSettings } = settings;
    const settingsToSave = {
      ...restSettings,
      partners: JSON.stringify(partners || [])
    };

    let doc;
    if (response.documents.length > 0) {
      doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.settings,
          response.documents[0].$id,
          settingsToSave
        ),
        'updateSettings'
      );
    } else {
      doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.settings,
          ID.unique(),
          settingsToSave
        ),
        'createSettings'
      );
    }

    setConnectionHealth(true);
    return {
      ...doc,
      partners: parsePartners((doc as SettingsDocument).partners),
      dataConfig
    } as unknown as AppSettings;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'saveSettings');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.settings,
        [Query.limit(1)]
      ),
      'getSettings'
    );

    setConnectionHealth(true);
    if (response.documents.length > 0) {
      const doc = response.documents[0] as SettingsDocument;
      return {
        ...doc,
        partners: parsePartners(doc.partners)
      } as unknown as AppSettings;
    }
    return null;
  } catch (error: unknown) {
    // Don't mark connection as unhealthy for settings - it's not critical
    console.error('Get settings error:', error);
    return null;
  }
}
