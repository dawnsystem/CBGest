/**
 * @fileoverview Infraestructura compartida de Appwrite para CBGest
 * @description Helpers de error, lógica de reintentos, estado de conexión,
 *   callbacks de notificación y funciones de salud. Todos los servicios de
 *   dominio dependen de este módulo.
 */

import { Query } from 'appwrite';
import { client as _client, account, databases, config } from '../../lib/appwrite/client';
import { authService } from '../authService';
import { dataLogger } from '../logger';

// ============================================================================
// ERROR HELPERS — DEBT-004
// ============================================================================

/**
 * Safely extract a human-readable message from any caught value.
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

/**
 * Safely extract an HTTP-style numeric code from any caught value.
 */
export const getErrorCode = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'code' in error) {
    const c = (error as { code: unknown }).code;
    return typeof c === 'number' ? c : undefined;
  }
  return undefined;
};

// ============================================================================
// MASTER DATA COPY HELPERS
// ============================================================================

export const MASTER_DATA_COPY_BATCH_SIZE = 100;

const hashMasterDataCopyKey = async (value: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is required to generate deterministic master-data copy IDs.');
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const buildMasterDataCopyDocumentId = async (
  collection: 'suppliers' | 'apartments',
  targetFiscalYearId: string,
  sourceDocumentId: string
): Promise<string> => {
  const prefix = collection === 'suppliers' ? 'ms' : 'ma';
  const hash = await hashMasterDataCopyKey(`${collection}:${targetFiscalYearId}:${sourceDocumentId}`);
  return `${prefix}-${hash.slice(0, 33)}`;
};

export const getCopySourceDocumentId = (
  collection: 'suppliers' | 'apartments',
  doc: { appwriteId?: string; id?: string; $id?: string }
): string => {
  const sourceDocumentId = doc.appwriteId || doc.id || doc.$id;
  if (!sourceDocumentId) {
    throw new Error(`[copyMasterData] Cannot copy ${collection}: source document is missing an ID.`);
  }
  return sourceDocumentId;
};

export const listFiscalYearDocumentIds = async (
  collectionId: string,
  fiscalYearId: string,
  operation: string
): Promise<Set<string>> => {
  const documentIds = new Set<string>();
  let offset = 0;

  while (true) {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        collectionId,
        [
          Query.equal('fiscalYearId', fiscalYearId),
          Query.limit(MASTER_DATA_COPY_BATCH_SIZE),
          Query.offset(offset)
        ]
      ),
      operation
    );

    for (const doc of response.documents) {
      documentIds.add(doc.$id);
    }

    if (response.documents.length < MASTER_DATA_COPY_BATCH_SIZE) {
      return documentIds;
    }

    offset += response.documents.length;
  }
};

// ============================================================================
// CONNECTION STATE
// ============================================================================

let connectionHealthy = false;

export const getConnectionHealth = (): boolean => connectionHealthy;
export const setConnectionHealth = (healthy: boolean) => {
  connectionHealthy = healthy;
};

// ============================================================================
// ERROR/SUCCESS CALLBACKS
// ============================================================================

type ErrorCallback = (error: string, operation: string) => void;
type SuccessCallback = (operation: string) => void;

let onErrorCallback: ErrorCallback | null = null;
let onSuccessCallback: SuccessCallback | null = null;

export const setNotificationCallbacks = (
  onError: ErrorCallback,
  onSuccess?: SuccessCallback
) => {
  onErrorCallback = onError;
  onSuccessCallback = onSuccess || null;
};

export const notifyError = (error: string, operation: string) => {
  console.error(`[${operation}]`, error);
  if (onErrorCallback) {
    onErrorCallback(error, operation);
  }
};

export const notifySuccess = (operation: string) => {
  if (onSuccessCallback) {
    onSuccessCallback(operation);
  }
};

// ============================================================================
// RETRY LOGIC
// ============================================================================

export const withRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> => {
  let lastError: unknown = null;
  const nonRetryableCodes = [401, 403, 404, 409];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        dataLogger.debug(`[${operationName}] Succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error: unknown) {
      lastError = error;

      // GLOBAL 401 HANDLER: Verificar si es sesión expirada o problema de permisos
      if (getErrorCode(error) === 401) {
        console.warn(`[${operationName}] Error 401 detectado - verificando si es sesión expirada o permisos`);
        authService.handleUnauthorizedError().catch(() => {});
        throw error;
      }

      if (nonRetryableCodes.includes(getErrorCode(error) as number)) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[${operationName}] Attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

// ============================================================================
// BACKWARDS COMPATIBILITY - initializeAppwrite (now a no-op)
// ============================================================================

/**
 * @deprecated El cliente Appwrite ahora se inicializa automáticamente.
 * Esta función existe solo para compatibilidad con código existente.
 */
export const initializeAppwrite = (_config?: any) => {
  dataLogger.debug('initializeAppwrite called - client already initialized via lib/appwrite/client.ts');
};

/**
 * Check if Appwrite is initialized (always true now)
 */
export const isAppwriteInitialized = (): boolean => true;

// ============================================================================
// CONNECTION & HEALTH CHECKS
// ============================================================================

/**
 * Test connection to Appwrite
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    await account.get().catch((error) => {
      if (getErrorCode(error) !== 401) throw error;
    });
    connectionHealthy = true;
    dataLogger.success('Appwrite connection test successful');
    return true;
  } catch (error: unknown) {
    console.error('Connection test failed:', getErrorMessage(error));
    connectionHealthy = false;
    return false;
  }
};

/**
 * Verify collections are accessible
 */
export const verifyCollections = async (): Promise<{
  success: boolean;
  collections: Record<string, boolean>;
  errors: string[];
}> => {
  const result = {
    success: true,
    collections: {} as Record<string, boolean>,
    errors: [] as string[]
  };

  const collectionsToCheck = [
    { id: config.collections.invoices, name: 'Facturas' },
    { id: config.collections.entries, name: 'Asientos' },
    { id: config.collections.transactions, name: 'Transacciones' },
    { id: config.collections.settings, name: 'Configuración' },
    { id: config.collections.suppliers, name: 'Proveedores' },
  ];

  for (const col of collectionsToCheck) {
    try {
      await databases.listDocuments(config.databaseId, col.id, [Query.limit(1)]);
      result.collections[col.name] = true;
      dataLogger.debug(`Colección '${col.name}' accesible`);
    } catch (error: unknown) {
      result.collections[col.name] = false;
      result.success = false;

      if (getErrorCode(error) === 404) {
        result.errors.push(`Colección '${col.name}' no existe.`);
      } else if (getErrorCode(error) === 401) {
        result.errors.push(`Sin permisos para '${col.name}'.`);
      } else {
        result.errors.push(`Error en '${col.name}': ${getErrorMessage(error)}`);
      }
      console.error(`Colección '${col.name}':`, getErrorMessage(error));
    }
  }

  return result;
};

/**
 * Full health check
 */
export const performHealthCheck = async (): Promise<{
  connected: boolean;
  authenticated: boolean;
  collectionsReady: boolean;
  errors: string[];
}> => {
  const result = {
    connected: false,
    authenticated: false,
    collectionsReady: false,
    errors: [] as string[]
  };

  // Check connection
  try {
    result.connected = await testConnection();
    if (!result.connected) {
      result.errors.push('No se puede conectar con Appwrite');
      return result;
    }
  } catch (error: unknown) {
    result.errors.push(`Error de conexión: ${getErrorMessage(error)}`);
    return result;
  }

  // Check authentication
  try {
    const user = await account.get();
    result.authenticated = !!user;
  } catch (error: unknown) {
    if (getErrorCode(error) === 401) {
      result.errors.push('Sesión expirada o no autenticado');
    } else {
      result.errors.push(`Error de autenticación: ${getErrorMessage(error)}`);
    }
    return result;
  }

  // Check collections
  try {
    const colCheck = await verifyCollections();
    result.collectionsReady = colCheck.success;
    if (!colCheck.success) {
      result.errors.push(...colCheck.errors);
    }
  } catch (error: unknown) {
    result.errors.push(`Error verificando colecciones: ${getErrorMessage(error)}`);
  }

  connectionHealthy = result.connected && result.authenticated && result.collectionsReady;
  return result;
};
