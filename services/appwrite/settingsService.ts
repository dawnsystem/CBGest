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
import { DEFAULT_AI_CONFIG, type AiConfig } from '../ai/types';

/**
 * ID fijo del documento singleton de settings (BUG-028).
 * Evita TOCTOU: dos clientes concurrentes no crean documentos distintos.
 */
export const SETTINGS_DOCUMENT_ID = 'app_settings';

type SettingsDocument = AppwriteEntity<AppSettings> & {
  $id?: string;
  partners?: string | AppSettings['partners'];
  touristTaxConfig?: string | TouristTaxConfig;
  aiConfig?: string | AiConfig;
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
 * Parsea aiConfig si viene como JSON string desde Appwrite.
 *
 * @param value - Config o string serializado
 * @returns AiConfig o undefined
 */
const parseAiConfig = (value: SettingsDocument['aiConfig']): AiConfig | undefined => {
  if (value == null) return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const obj = parsed as Partial<AiConfig>;
  const preferred = obj.preferredProvider;
  const validPreferred =
    preferred === 'auto' ||
    preferred === 'gemini' ||
    preferred === 'groq' ||
    preferred === 'openrouter';
  return {
    preferredProvider: validPreferred ? preferred : DEFAULT_AI_CONFIG.preferredProvider,
    failoverEnabled:
      typeof obj.failoverEnabled === 'boolean'
        ? obj.failoverEnabled
        : DEFAULT_AI_CONFIG.failoverEnabled,
  };
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
    address: typeof doc.address === 'string' ? doc.address : undefined,
    streetNumber: typeof doc.streetNumber === 'string' ? doc.streetNumber : undefined,
    postalCode: typeof doc.postalCode === 'string' ? doc.postalCode : undefined,
    city: typeof doc.city === 'string' ? doc.city : undefined,
    province: typeof doc.province === 'string' ? doc.province : undefined,
    phone: typeof doc.phone === 'string' ? doc.phone : undefined,
    contactPerson: typeof doc.contactPerson === 'string' ? doc.contactPerson : undefined,
    representativeNif: typeof doc.representativeNif === 'string' ? doc.representativeNif : undefined,
    representativeName: typeof doc.representativeName === 'string' ? doc.representativeName : undefined,
  };

  const taxConfig = parseTouristTaxConfig(doc.touristTaxConfig);
  if (taxConfig) {
    mapped.touristTaxConfig = taxConfig;
  }
  const aiConfig = parseAiConfig(doc.aiConfig);
  if (aiConfig) {
    mapped.aiConfig = aiConfig;
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
    address: settings.address || '',
    streetNumber: settings.streetNumber || '',
    postalCode: settings.postalCode || '',
    city: settings.city || '',
    province: settings.province || '',
    phone: settings.phone || '',
    contactPerson: settings.contactPerson || '',
    representativeNif: settings.representativeNif || '',
    representativeName: settings.representativeName || '',
  };
  if (settings.touristTaxConfig) {
    payload.touristTaxConfig = JSON.stringify(settings.touristTaxConfig);
  }
  if (settings.aiConfig) {
    payload.aiConfig = JSON.stringify(settings.aiConfig);
  }
  return payload;
}

/**
 * Detecta errores de atributo desconocido en Appwrite (schema Cloud incompleto).
 *
 * @param error - Error crudo
 * @returns true si parece atributo inválido/desconocido
 */
function isUnknownAttributeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /unknown attribute|Invalid document structure|aiConfig/i.test(message);
}

/**
 * Persiste el payload (update → create → update-on-409).
 *
 * @param payload - Payload de negocio
 * @param targetId - ID documento
 * @returns Documento guardado
 */
async function persistSettingsDocument(
  payload: Record<string, unknown>,
  targetId: string
): Promise<SettingsDocument> {
  try {
    return (await withRetry(
      () =>
        databases.updateDocument(
          config.databaseId,
          config.collections.settings,
          targetId,
          payload
        ),
      'updateSettings'
    )) as SettingsDocument;
  } catch (updateError: unknown) {
    const code = getErrorCode(updateError);
    if (code !== 404) {
      throw updateError;
    }

    try {
      return (await withRetry(
        () =>
          databases.createDocument(
            config.databaseId,
            config.collections.settings,
            SETTINGS_DOCUMENT_ID,
            payload
          ),
        'createSettings'
      )) as SettingsDocument;
    } catch (createError: unknown) {
      if (getErrorCode(createError) === 409) {
        return (await withRetry(
          () =>
            databases.updateDocument(
              config.databaseId,
              config.collections.settings,
              SETTINGS_DOCUMENT_ID,
              payload
            ),
          'updateSettingsAfterConflict'
        )) as SettingsDocument;
      }
      throw createError;
    }
  }
}

/**
 * Guarda settings con ID fijo / appwriteId conocido (BUG-028).
 * Si create choca (409), hace update del documento existente.
 * Si `aiConfig` aún no existe en el schema Cloud, reintenta sin ese campo
 * y conserva la preferencia local en el valor retornado.
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
      doc = await persistSettingsDocument(settingsToSave, targetId);
    } catch (error: unknown) {
      if (settingsToSave.aiConfig && isUnknownAttributeError(error)) {
        console.warn(
          '[settingsService] Atributo aiConfig ausente en Appwrite; persistiendo resto y conservando aiConfig en cliente.'
        );
        const withoutAi = { ...settingsToSave };
        delete withoutAi.aiConfig;
        doc = await persistSettingsDocument(withoutAi, targetId);
        const mapped = mapSettingsDocument(doc, settings.dataConfig);
        return { ...mapped, aiConfig: settings.aiConfig };
      }
      throw error;
    }

    setConnectionHealth(true);
    const mapped = mapSettingsDocument(doc, settings.dataConfig);
    // Preservar aiConfig local si Cloud aún no lo devuelve
    if (settings.aiConfig && !mapped.aiConfig) {
      return { ...mapped, aiConfig: settings.aiConfig };
    }
    return mapped;
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
