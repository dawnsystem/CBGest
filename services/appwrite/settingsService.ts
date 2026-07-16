/**
 * @fileoverview Servicio de configuración para Appwrite
 */

import { Query } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { AppSettings, TouristTaxConfig } from '../../types';

/**
 * ID fijo del documento singleton de settings (BUG-028).
 * Evita TOCTOU: dos clientes concurrentes no crean documentos distintos.
 */
export const SETTINGS_DOCUMENT_ID = 'app_settings';

type SettingsDocument = AppwriteEntity<AppSettings> & {
  $id?: string;
  partners?: string | AppSettings['partners'];
  touristTaxConfig?: string | TouristTaxConfig;
};

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

/**
 * Parsea touristTaxConfig si viene como JSON string desde Appwrite.
 *
 * @param value - Config o string serializado
 * @returns TouristTaxConfig o undefined
 */
const parseTouristTaxConfig = (
  value: SettingsDocument['touristTaxConfig']
): TouristTaxConfig | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TouristTaxConfig;
    } catch {
      return undefined;
    }
  }
  return value;
};

/**
 * Mapea un documento Appwrite a `AppSettings` limpio (BUG-027).
 * No propaga metadatos `$id`, `$permissions`, etc. que romperían updateDocument.
 *
 * @param doc - Documento crudo de Appwrite
 * @param dataConfig - dataConfig local (no se persiste en la colección settings)
 * @returns AppSettings tipado sin metadatos Appwrite
 * @example
 * const settings = mapSettingsDocument(doc, local.dataConfig);
 */
export function mapSettingsDocument(
  doc: SettingsDocument,
  dataConfig?: AppSettings['dataConfig']
): AppSettings {
  const mapped: AppSettings = {
    appwriteId: doc.$id || doc.appwriteId || doc.id,
    cbName: typeof doc.cbName === 'string' ? doc.cbName : '',
    nif: typeof doc.nif === 'string' ? doc.nif : '',
    fiscalRegime: doc.fiscalRegime === 'ALQUILER_EXENTO' ? 'ALQUILER_EXENTO' : 'GENERAL',
    vatObligation: Boolean(doc.vatObligation),
    partners: parsePartners(doc.partners),
  };

  const taxConfig = parseTouristTaxConfig(doc.touristTaxConfig);
  if (taxConfig) {
    mapped.touristTaxConfig = taxConfig;
  }
  if (dataConfig !== undefined) {
    mapped.dataConfig = dataConfig;
  }
  return mapped;
}

/**
 * Payload de persistencia: solo atributos de negocio (BUG-027).
 *
 * @param settings - Settings de la app
 * @returns Objeto listo para create/updateDocument
 */
export function buildSettingsPayload(settings: AppSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    cbName: settings.cbName,
    nif: settings.nif,
    fiscalRegime: settings.fiscalRegime,
    vatObligation: settings.vatObligation,
    partners: JSON.stringify(settings.partners || []),
  };
  if (settings.touristTaxConfig) {
    payload.touristTaxConfig = JSON.stringify(settings.touristTaxConfig);
  }
  return payload;
}

/**
 * Guarda settings con ID fijo / appwriteId conocido (BUG-028).
 * Si create choca (409), hace update del documento existente.
 *
 * @param settings - Configuración a persistir
 * @returns Settings mapeados tras guardar
 * @throws Si Appwrite falla tras reintentos
 */
export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  try {
    const settingsToSave = buildSettingsPayload(settings);
    const targetId = settings.appwriteId || SETTINGS_DOCUMENT_ID;
    let doc: SettingsDocument;

    try {
      doc = (await withRetry(
        () =>
          databases.updateDocument(
            config.databaseId,
            config.collections.settings,
            targetId,
            settingsToSave
          ),
        'updateSettings'
      )) as SettingsDocument;
    } catch (updateError: unknown) {
      const code = getErrorCode(updateError);
      if (code !== 404) {
        throw updateError;
      }

      try {
        doc = (await withRetry(
          () =>
            databases.createDocument(
              config.databaseId,
              config.collections.settings,
              SETTINGS_DOCUMENT_ID,
              settingsToSave
            ),
          'createSettings'
        )) as SettingsDocument;
      } catch (createError: unknown) {
        // Otro cliente creó el documento entre medias (TOCTOU) → update
        if (getErrorCode(createError) === 409) {
          doc = (await withRetry(
            () =>
              databases.updateDocument(
                config.databaseId,
                config.collections.settings,
                SETTINGS_DOCUMENT_ID,
                settingsToSave
              ),
            'updateSettingsAfterConflict'
          )) as SettingsDocument;
        } else {
          throw createError;
        }
      }
    }

    setConnectionHealth(true);
    return mapSettingsDocument(doc, settings.dataConfig);
  } catch (error: unknown) {
    notifyError(error instanceof Error ? error.message : String(error), 'saveSettings');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Lee settings preferiendo el documento singleton fijo (BUG-028).
 * Fallback a listDocuments(limit:1) para installs legacy.
 *
 * @returns AppSettings o null si no hay documento
 */
export async function getSettings(): Promise<AppSettings | null> {
  try {
    try {
      const doc = (await withRetry(
        () =>
          databases.getDocument(
            config.databaseId,
            config.collections.settings,
            SETTINGS_DOCUMENT_ID
          ),
        'getSettingsById'
      )) as SettingsDocument;
      setConnectionHealth(true);
      return mapSettingsDocument(doc);
    } catch (byIdError: unknown) {
      if (getErrorCode(byIdError) !== 404) {
        throw byIdError;
      }
    }

    const response = await withRetry(
      () =>
        databases.listDocuments(config.databaseId, config.collections.settings, [
          Query.limit(1),
        ]),
      'getSettings'
    );

    setConnectionHealth(true);
    if (response.documents.length > 0) {
      return mapSettingsDocument(response.documents[0] as SettingsDocument);
    }
    return null;
  } catch (error: unknown) {
    // Don't mark connection as unhealthy for settings - it's not critical
    console.error('Get settings error:', error);
    return null;
  }
}
