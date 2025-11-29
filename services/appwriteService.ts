/**
 * @fileoverview Servicios de Appwrite para CBGest
 * @description Servicios de base de datos, almacenamiento y realtime.
 *
 * ARCHITECTURE NOTE:
 * This file provides low-level Appwrite API operations with retry logic.
 * For application code, USE protectedDatabase from lib/appwrite/protectedDatabase.ts
 * which adds rate limiting and caching on top of these services.
 *
 * Layer hierarchy:
 * 1. lib/appwrite/client.ts - Appwrite SDK client instances
 * 2. services/appwriteService.ts - CRUD operations with retry (THIS FILE)
 * 3. lib/appwrite/protectedDatabase.ts - Rate limiting, caching, debounce
 *
 * Components should import from protectedDatabase, not directly from here.
 * Auth operations are in authService.ts.
 */

import { Query, ID } from 'appwrite';
import { client, account, databases, storage, config } from '../lib/appwrite/client';
import { authService } from './authService';
import { dataLogger } from './logger';
import type {
  Invoice,
  AccountingEntry,
  BankTransaction,
  AppSettings,
  AppUser,
  Supplier,
  Notification,
  QueueItem,
  Apartment,
  RecurringExpense,
  AIMatchHistory,
  Reservation
} from '../types';

// Re-export authService from the new location for backwards compatibility
export { authService } from './authService';

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

const notifyError = (error: string, operation: string) => {
  console.error(`[${operation}]`, error);
  if (onErrorCallback) {
    onErrorCallback(error, operation);
  }
};

const notifySuccess = (operation: string) => {
  if (onSuccessCallback) {
    onSuccessCallback(operation);
  }
};

// ============================================================================
// RETRY LOGIC
// ============================================================================

const withRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> => {
  let lastError: Error | null = null;
  const nonRetryableCodes = [401, 403, 404, 409];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        dataLogger.debug(`[${operationName}] Succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // GLOBAL 401 HANDLER: Verificar si es sesión expirada o problema de permisos
      if (error?.code === 401) {
        console.warn(`[${operationName}] Error 401 detectado - verificando si es sesión expirada o permisos`);
        // Don't await - let it run in background to avoid blocking the error throw
        authService.handleUnauthorizedError().catch(() => {});
        throw error;
      }

      if (nonRetryableCodes.includes(error?.code)) {
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
      if (error?.code !== 401) throw error;
    });
    connectionHealthy = true;
    dataLogger.success('Appwrite connection test successful');
    return true;
  } catch (error: any) {
    console.error('Connection test failed:', error?.message);
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
    } catch (error: any) {
      result.collections[col.name] = false;
      result.success = false;

      if (error?.code === 404) {
        result.errors.push(`Colección '${col.name}' no existe.`);
      } else if (error?.code === 401) {
        result.errors.push(`Sin permisos para '${col.name}'.`);
      } else {
        result.errors.push(`Error en '${col.name}': ${error?.message}`);
      }
      console.error(`Colección '${col.name}':`, error?.message);
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
  } catch (error: any) {
    result.errors.push(`Error de conexión: ${error?.message}`);
    return result;
  }

  // Check authentication
  try {
    const user = await account.get();
    result.authenticated = !!user;
  } catch (error: any) {
    if (error?.code === 401) {
      result.errors.push('Sesión expirada o no autenticado');
    } else {
      result.errors.push(`Error de autenticación: ${error?.message}`);
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
  } catch (error: any) {
    result.errors.push(`Error verificando colecciones: ${error?.message}`);
  }

  connectionHealthy = result.connected && result.authenticated && result.collectionsReady;
  return result;
};

// ============================================================================
// DATABASE SERVICE
// ============================================================================

export const databaseService = {
  // --- INVOICES ---
  async createInvoice(invoice: Invoice): Promise<Invoice> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente o que no existen en el esquema de facturas
      // NOTA: Los campos del emisor (issuerNifType, issuerAddress, etc.) se usan en App.tsx
      // para crear el proveedor ANTES de esta llamada fallar, usando originalInvoice
      const {
        file, history, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        // Campos del emisor para el proveedor - no existen en el esquema de facturas de Appwrite
        issuerNifType, issuerAddress, issuerCity, issuerPostalCode, issuerCountry,
        // Campos generados por Gemini que no están en el esquema de Appwrite
        suggestedAccountCode, matchedSupplierId,
        // fileData contains large base64 data from Gemini - must not be sent to Appwrite
        fileData,
        ...restInvoiceData
      } = invoice as any;

      // Appwrite expects history as an array of strings (each event serialized as JSON)
      const historyArray = history && Array.isArray(history)
        ? history.map((event: any) => typeof event === 'string' ? event : JSON.stringify(event))
        : [];

      const invoiceData = {
        ...restInvoiceData,
        history: historyArray
      };

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.invoices,
          invoice.id || ID.unique(),
          invoiceData
        ),
        'createInvoice'
      );

      notifySuccess('Factura guardada');
      connectionHealthy = true;

      // Parse history back to objects
      const parsedHistory = (doc.history && Array.isArray(doc.history))
        ? doc.history.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item)
        : [];

      return {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: parsedHistory
      } as unknown as Invoice;
    } catch (error: any) {
      notifyError(error.message, 'createInvoice');
      connectionHealthy = false;
      throw error;
    }
  },

  async getInvoices(): Promise<Invoice[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.invoices,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getInvoices'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => {
        // Parse history: it's stored as an array of JSON strings
        let parsedHistory: any[] = [];
        if (doc.history && Array.isArray(doc.history)) {
          parsedHistory = doc.history.map((item: any) => {
            if (typeof item === 'string') {
              try {
                return JSON.parse(item);
              } catch {
                return { action: item, date: new Date().toISOString(), user: 'system' };
              }
            }
            return item;
          });
        } else if (doc.history && typeof doc.history === 'string') {
          // Legacy support: single JSON string
          try {
            parsedHistory = JSON.parse(doc.history);
          } catch {
            parsedHistory = [];
          }
        }

        return {
          ...doc,
          id: doc.$id,
          appwriteId: doc.$id,
          history: parsedHistory
        };
      }) as unknown as Invoice[];
    } catch (error: any) {
      notifyError(error.message, 'getInvoices');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente o que no existen en el esquema
      const {
        file, history, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        // Campos del emisor - no existen en el esquema de facturas de Appwrite
        issuerNifType, issuerAddress, issuerCity, issuerPostalCode, issuerCountry,
        // Campos generados por Gemini que no están en el esquema de Appwrite
        suggestedAccountCode, matchedSupplierId,
        // fileData contains large base64 data from Gemini - must not be sent to Appwrite
        fileData,
        ...restInvoiceData
      } = invoice as any;

      // Appwrite expects history as an array of strings (each event serialized as JSON)
      const historyArray = history && Array.isArray(history)
        ? history.map((event: any) => typeof event === 'string' ? event : JSON.stringify(event))
        : [];

      const invoiceData = {
        ...restInvoiceData,
        history: historyArray
      };

      const docId = invoice.appwriteId || invoice.id;
      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.invoices,
          docId,
          invoiceData
        ),
        'updateInvoice'
      );

      notifySuccess('Factura actualizada');
      connectionHealthy = true;

      // Parse history back to objects
      const parsedHistory = (doc.history && Array.isArray(doc.history))
        ? doc.history.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item)
        : [];

      return {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: parsedHistory
      } as unknown as Invoice;
    } catch (error: any) {
      notifyError(error.message, 'updateInvoice');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteInvoice(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.invoices, id),
        'deleteInvoice'
      );
      notifySuccess('Factura eliminada');
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteInvoice');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- ENTRIES ---
  async createEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente y campos que no existen en el esquema
      const {
        referenceDoc, id, appwriteId, lines,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...entryData
      } = entry as any;

      // NOTA: El campo 'lines' NO existe en el esquema de Appwrite para entries.
      // Usamos los campos legacy (accountCode, accountName, debit, credit) directamente.
      // Si hay lines, extraemos la primera línea para los campos legacy.
      const dataToSave = {
        ...entryData,
        // Usar datos de la primera línea si existen, o los valores directos
        accountCode: lines?.[0]?.accountCode || entryData.accountCode || '',
        accountName: lines?.[0]?.accountName || entryData.accountName || '',
        debit: lines?.[0]?.debit ?? entryData.debit ?? 0,
        credit: lines?.[0]?.credit ?? entryData.credit ?? 0,
      };

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.entries,
          id || ID.unique(),
          dataToSave
        ),
        'createEntry'
      );

      connectionHealthy = true;
      
      // Reconstruir líneas desde campos legacy al devolver
      return {
        ...doc,
        referenceDoc,
        id: doc.$id,
        appwriteId: doc.$id,
        lines: [{
          accountCode: doc.accountCode || '',
          accountName: doc.accountName || '',
          debit: doc.debit || 0,
          credit: doc.credit || 0
        }]
      } as unknown as AccountingEntry;
    } catch (error: any) {
      notifyError(error.message, 'createEntry');
      connectionHealthy = false;
      throw error;
    }
  },

  async getEntries(): Promise<AccountingEntry[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.entries,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getEntries'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => {
        // El esquema de Appwrite no tiene 'lines', construir desde campos legacy
        return {
          ...doc,
          id: doc.$id,
          appwriteId: doc.$id,
          lines: [{
            accountCode: doc.accountCode || '',
            accountName: doc.accountName || '',
            debit: doc.debit || 0,
            credit: doc.credit || 0
          }]
        };
      }) as unknown as AccountingEntry[];
    } catch (error: any) {
      notifyError(error.message, 'getEntries');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente y campos que no existen en el esquema
      const {
        referenceDoc, id, appwriteId, lines,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...entryData
      } = entry as any;
      const docId = appwriteId || id;

      // NOTA: El campo 'lines' NO existe en el esquema de Appwrite para entries.
      // Usamos los campos legacy (accountCode, accountName, debit, credit) directamente.
      const dataToSave = {
        ...entryData,
        // Usar datos de la primera línea si existen, o los valores directos
        accountCode: lines?.[0]?.accountCode || entryData.accountCode || '',
        accountName: lines?.[0]?.accountName || entryData.accountName || '',
        debit: lines?.[0]?.debit ?? entryData.debit ?? 0,
        credit: lines?.[0]?.credit ?? entryData.credit ?? 0,
      };

      const doc = await withRetry(
        () => databases.updateDocument(config.databaseId, config.collections.entries, docId, dataToSave),
        'updateEntry'
      );

      connectionHealthy = true;
      
      // Reconstruir líneas desde campos legacy al devolver
      return {
        ...doc,
        referenceDoc,
        id: doc.$id,
        appwriteId: doc.$id,
        lines: [{
          accountCode: doc.accountCode || '',
          accountName: doc.accountName || '',
          debit: doc.debit || 0,
          credit: doc.credit || 0
        }]
      } as unknown as AccountingEntry;
    } catch (error: any) {
      notifyError(error.message, 'updateEntry');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteEntry(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.entries, id),
        'deleteEntry'
      );
      notifySuccess('Asiento eliminado');
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteEntry');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- TRANSACTIONS ---
  async createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...transactionData
      } = transaction as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.transactions,
          id || ID.unique(),
          transactionData
        ),
        'createTransaction'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankTransaction;
    } catch (error: any) {
      notifyError(error.message, 'createTransaction');
      connectionHealthy = false;
      throw error;
    }
  },

  async getTransactions(): Promise<BankTransaction[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.transactions,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getTransactions'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as BankTransaction[];
    } catch (error: any) {
      notifyError(error.message, 'getTransactions');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...transactionData
      } = transaction as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(config.databaseId, config.collections.transactions, docId, transactionData),
        'updateTransaction'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankTransaction;
    } catch (error: any) {
      notifyError(error.message, 'updateTransaction');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- SETTINGS ---
  async saveSettings(settings: AppSettings): Promise<AppSettings> {
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

      connectionHealthy = true;
      return {
        ...doc,
        partners: JSON.parse((doc as any).partners || '[]'),
        dataConfig
      } as unknown as AppSettings;
    } catch (error: any) {
      notifyError(error.message, 'saveSettings');
      connectionHealthy = false;
      throw error;
    }
  },

  async getSettings(): Promise<AppSettings | null> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.settings,
          [Query.limit(1)]
        ),
        'getSettings'
      );

      connectionHealthy = true;
      if (response.documents.length > 0) {
        const doc = response.documents[0] as any;
        return {
          ...doc,
          partners: typeof doc.partners === 'string'
            ? JSON.parse(doc.partners || '[]')
            : (doc.partners || [])
        } as unknown as AppSettings;
      }
      return null;
    } catch (error: any) {
      // Don't mark connection as unhealthy for settings - it's not critical
      console.error('Get settings error:', error);
      return null;
    }
  },

  // --- SUPPLIERS ---
  async createSupplier(supplier: Supplier): Promise<Supplier> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...supplierData
      } = supplier as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.suppliers,
          id || ID.unique(),
          supplierData
        ),
        'createSupplier'
      );

      notifySuccess('Proveedor creado');
      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
    } catch (error: any) {
      notifyError(error.message, 'createSupplier');
      connectionHealthy = false;
      throw error;
    }
  },

  async getSuppliers(): Promise<Supplier[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.suppliers,
          [Query.orderAsc('name'), Query.limit(1000)]
        ),
        'getSuppliers'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Supplier[];
    } catch (error: any) {
      notifyError(error.message, 'getSuppliers');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateSupplier(supplier: Supplier): Promise<Supplier> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...supplierData
      } = supplier as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.suppliers,
          docId,
          supplierData
        ),
        'updateSupplier'
      );

      notifySuccess('Proveedor actualizado');
      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
    } catch (error: any) {
      notifyError(error.message, 'updateSupplier');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteSupplier(appwriteId: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.suppliers, appwriteId),
        'deleteSupplier'
      );
      notifySuccess('Proveedor eliminado');
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteSupplier');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- NOTIFICATIONS ---
  async createNotification(notification: Notification): Promise<Notification> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...notificationData
      } = notification as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.notifications,
          id || ID.unique(),
          notificationData
        ),
        'createNotification'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
    } catch (error: any) {
      notifyError(error.message, 'createNotification');
      connectionHealthy = false;
      throw error;
    }
  },

  async getNotifications(): Promise<Notification[]> {
    try {
      if (!config.collections.notifications) return [];

      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.notifications,
          [Query.orderDesc('timestamp'), Query.limit(100)]
        ),
        'getNotifications'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Notification[];
    } catch (error: any) {
      if (error?.code === 404 || error?.code === 401) return [];
      notifyError(error.message, 'getNotifications');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateNotification(notification: Notification): Promise<Notification> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...notificationData
      } = notification as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.notifications,
          docId,
          notificationData
        ),
        'updateNotification'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
    } catch (error: any) {
      notifyError(error.message, 'updateNotification');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteNotification(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.notifications, id),
        'deleteNotification'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteNotification');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteAllNotifications(): Promise<void> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.notifications,
          [Query.limit(100)]
        ),
        'listNotificationsForDelete'
      );

      await Promise.all(
        response.documents.map(doc =>
          withRetry(
            () => databases.deleteDocument(config.databaseId, config.collections.notifications, doc.$id),
            'deleteNotificationBatch'
          )
        )
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteAllNotifications');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- UPLOAD QUEUE ---
  async createUploadItem(item: QueueItem): Promise<QueueItem> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        file, result, bankResult, id,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...itemData
      } = item as any;

      const dataToSave = {
        ...itemData,
        progress: Math.round(itemData.progress || 0),
        result: result ? JSON.stringify(result) : undefined,
        bankResult: bankResult ? JSON.stringify(bankResult) : undefined
      };

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.uploads,
          id || ID.unique(),
          dataToSave
        ),
        'createUploadItem'
      );

      connectionHealthy = true;
      return { ...doc, file, result, bankResult, id: doc.$id } as unknown as QueueItem;
    } catch (error: any) {
      notifyError(error.message, 'createUploadItem');
      connectionHealthy = false;
      throw error;
    }
  },

  async getUploadQueue(): Promise<QueueItem[]> {
    try {
      if (!config.collections.uploads) return [];

      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.uploads,
          [Query.orderDesc('timestamp'), Query.limit(100)]
        ),
        'getUploadQueue'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        result: doc.result && typeof doc.result === 'string' ? JSON.parse(doc.result) : doc.result,
        bankResult: doc.bankResult && typeof doc.bankResult === 'string' ? JSON.parse(doc.bankResult) : doc.bankResult
      })) as unknown as QueueItem[];
    } catch (error: any) {
      if (error?.code === 404 || error?.code === 401) return [];
      notifyError(error.message, 'getUploadQueue');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateUploadItem(item: QueueItem): Promise<QueueItem> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        file, result, bankResult, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...itemData
      } = item as any;
      const docId = appwriteId || id;

      const dataToSave = {
        ...itemData,
        progress: Math.round(itemData.progress || 0),
        result: result ? JSON.stringify(result) : undefined,
        bankResult: bankResult ? JSON.stringify(bankResult) : undefined
      };

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.uploads,
          docId,
          dataToSave
        ),
        'updateUploadItem'
      );

      connectionHealthy = true;
      return { ...doc, file, result, bankResult, id: doc.$id } as unknown as QueueItem;
    } catch (error: any) {
      notifyError(error.message, 'updateUploadItem');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteUploadItem(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.uploads, id),
        'deleteUploadItem'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteUploadItem');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteCompletedUploads(): Promise<void> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.uploads,
          [Query.equal('status', 'COMPLETED'), Query.limit(100)]
        ),
        'listCompletedUploads'
      );

      await Promise.all(
        response.documents.map(doc =>
          withRetry(
            () => databases.deleteDocument(config.databaseId, config.collections.uploads, doc.$id),
            'deleteCompletedUploadBatch'
          )
        )
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteCompletedUploads');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- APARTMENTS (NEW) ---
  async createApartment(apartment: Apartment): Promise<Apartment> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...apartmentData
      } = apartment as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.apartments,
          id || ID.unique(),
          apartmentData
        ),
        'createApartment'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Apartment;
    } catch (error: any) {
      notifyError(error.message, 'createApartment');
      connectionHealthy = false;
      throw error;
    }
  },

  async getApartments(): Promise<Apartment[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.apartments,
          [Query.orderAsc('name'), Query.limit(100)]
        ),
        'getApartments'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Apartment[];
    } catch (error: any) {
      if (error?.code === 404) return []; // Collection doesn't exist yet
      notifyError(error.message, 'getApartments');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateApartment(apartment: Apartment): Promise<Apartment> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...apartmentData
      } = apartment as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.apartments,
          docId,
          apartmentData
        ),
        'updateApartment'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Apartment;
    } catch (error: any) {
      notifyError(error.message, 'updateApartment');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteApartment(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.apartments, id),
        'deleteApartment'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteApartment');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- RECURRING EXPENSES (NEW) ---
  async createRecurringExpense(expense: RecurringExpense): Promise<RecurringExpense> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...expenseData
      } = expense as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.recurringExpenses,
          id || ID.unique(),
          expenseData
        ),
        'createRecurringExpense'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as RecurringExpense;
    } catch (error: any) {
      notifyError(error.message, 'createRecurringExpense');
      connectionHealthy = false;
      throw error;
    }
  },

  async getRecurringExpenses(): Promise<RecurringExpense[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.recurringExpenses,
          [Query.orderAsc('name'), Query.limit(500)]
        ),
        'getRecurringExpenses'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as RecurringExpense[];
    } catch (error: any) {
      if (error?.code === 404) return []; // Collection doesn't exist yet
      notifyError(error.message, 'getRecurringExpenses');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateRecurringExpense(expense: RecurringExpense): Promise<RecurringExpense> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...expenseData
      } = expense as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.recurringExpenses,
          docId,
          expenseData
        ),
        'updateRecurringExpense'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as RecurringExpense;
    } catch (error: any) {
      notifyError(error.message, 'updateRecurringExpense');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteRecurringExpense(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.recurringExpenses, id),
        'deleteRecurringExpense'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteRecurringExpense');
      connectionHealthy = false;
      throw error;
    }
  },

  // --- AI MATCH HISTORY (NEW) ---
  async createAIMatchHistory(match: AIMatchHistory): Promise<AIMatchHistory> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, lastUsedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...matchData
      } = match as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.aiMatchHistory,
          id || ID.unique(),
          matchData
        ),
        'createAIMatchHistory'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
    } catch (error: any) {
      notifyError(error.message, 'createAIMatchHistory');
      connectionHealthy = false;
      throw error;
    }
  },

  async getAIMatchHistory(): Promise<AIMatchHistory[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.aiMatchHistory,
          [Query.orderDesc('usageCount'), Query.limit(1000)]
        ),
        'getAIMatchHistory'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as AIMatchHistory[];
    } catch (error: any) {
      if (error?.code === 404) return []; // Collection doesn't exist yet
      notifyError(error.message, 'getAIMatchHistory');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateAIMatchHistory(match: AIMatchHistory): Promise<AIMatchHistory> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        id, appwriteId,
        createdAt, lastUsedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...matchData
      } = match as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.aiMatchHistory,
          docId,
          matchData
        ),
        'updateAIMatchHistory'
      );

      connectionHealthy = true;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
    } catch (error: any) {
      notifyError(error.message, 'updateAIMatchHistory');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteAIMatchHistory(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.aiMatchHistory, id),
        'deleteAIMatchHistory'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteAIMatchHistory');
      connectionHealthy = false;
      throw error;
    }
  },

  async findMatchByBankConcept(concept: string): Promise<AIMatchHistory | null> {
    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.aiMatchHistory,
        [
          Query.search('bankConcept', concept),
          Query.orderDesc('usageCount'),
          Query.limit(1)
        ]
      );

      if (response.documents.length > 0) {
        const doc = response.documents[0] as any;
        return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
      }
      return null;
    } catch (error: any) {
      if (error?.code === 404) return null;
      console.error('Find match by bank concept error:', error);
      return null;
    }
  },

  // --- RESERVATIONS ---
  async getReservations(): Promise<Reservation[]> {
    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.collections.reservations,
          [Query.orderDesc('checkIn'), Query.limit(5000)]
        ),
        'getReservations'
      );

      connectionHealthy = true;
      return response.documents.map((doc: any) => {
        const {
          $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
          ...reservationData
        } = doc;
        return { ...reservationData, id: $id, appwriteId: $id } as Reservation;
      });
    } catch (error: any) {
      if (error?.code === 404) return [];
      notifyError(error.message, 'getReservations');
      connectionHealthy = false;
      throw error;
    }
  },

  async createReservation(reservation: Reservation): Promise<Reservation> {
    try {
      const {
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        appwriteId, file, id, ...reservationData
      } = reservation as any;

      const savedDoc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.reservations,
          id || ID.unique(),
          reservationData
        ),
        'createReservation'
      );

      connectionHealthy = true;
      // Return saved document data to ensure consistency
      const {
        $id: savedId, $createdAt: _, $updatedAt: __, $databaseId: ___, $collectionId: ____, $permissions: _____,
        ...savedData
      } = savedDoc as any;
      return { ...savedData, id: savedId, appwriteId: savedId } as Reservation;
    } catch (error: any) {
      notifyError(error.message, 'createReservation');
      connectionHealthy = false;
      throw error;
    }
  },

  async createReservations(reservations: Reservation[]): Promise<Reservation[]> {
    const results: Reservation[] = [];

    for (const reservation of reservations) {
      try {
        const saved = await this.createReservation(reservation);
        results.push(saved);
      } catch (error) {
        console.error('Error creating reservation:', reservation.id, error);
        // Continue with other reservations
      }
    }

    return results;
  },

  async updateReservation(reservation: Reservation): Promise<Reservation> {
    try {
      const docId = reservation.appwriteId || reservation.id;
      const {
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        appwriteId, file, id, ...reservationData
      } = reservation as any;

      const updatedDoc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.reservations,
          docId,
          reservationData
        ),
        'updateReservation'
      );

      connectionHealthy = true;
      // Return updated document data to ensure consistency
      const {
        $id: updatedId, $createdAt: _, $updatedAt: __, $databaseId: ___, $collectionId: ____, $permissions: _____,
        ...updatedData
      } = updatedDoc as any;
      return { ...updatedData, id: updatedId, appwriteId: updatedId } as Reservation;
    } catch (error: any) {
      notifyError(error.message, 'updateReservation');
      connectionHealthy = false;
      throw error;
    }
  },

  async deleteReservation(id: string): Promise<void> {
    try {
      await withRetry(
        () => databases.deleteDocument(config.databaseId, config.collections.reservations, id),
        'deleteReservation'
      );
      connectionHealthy = true;
    } catch (error: any) {
      notifyError(error.message, 'deleteReservation');
      connectionHealthy = false;
      throw error;
    }
  }
};

// ============================================================================
// STORAGE SERVICE
// ============================================================================

export const storageService = {
  async uploadFile(file: File, id?: string): Promise<string> {
    try {
      const uploadedFile = await storage.createFile(config.bucketId, id || ID.unique(), file);
      return uploadedFile.$id;
    } catch (error: any) {
      console.error('Upload file error:', error);
      throw error;
    }
  },

  getFileUrl(fileId: string): string {
    return `${import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'}/storage/buckets/${config.bucketId}/files/${fileId}/view`;
  },

  async downloadFile(fileId: string): Promise<Blob> {
    try {
      const file = await storage.getFileDownload(config.bucketId, fileId);
      return file as unknown as Blob;
    } catch (error: any) {
      console.error('Download file error:', error);
      throw error;
    }
  },

  async deleteFile(fileId: string): Promise<void> {
    try {
      await storage.deleteFile(config.bucketId, fileId);
    } catch (error: any) {
      console.error('Delete file error:', error);
      throw error;
    }
  }
};

// ============================================================================
// REALTIME SERVICE
// ============================================================================

export const realtimeService = {
  subscribeToInvoices(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.invoices}.documents`,
      callback
    );
  },

  subscribeToEntries(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.entries}.documents`,
      callback
    );
  },

  subscribeToTransactions(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.transactions}.documents`,
      callback
    );
  }
};

export const subscribeToChanges = (callback: (payload: any) => void): (() => void) => {
  const unsubscribeInvoices = realtimeService.subscribeToInvoices(callback);
  const unsubscribeEntries = realtimeService.subscribeToEntries(callback);
  const unsubscribeTransactions = realtimeService.subscribeToTransactions(callback);

  return () => {
    unsubscribeInvoices();
    unsubscribeEntries();
    unsubscribeTransactions();
  };
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export const createInvoice = async (invoice: Invoice): Promise<Invoice> => {
  let appwriteFileId: string | undefined;

  if (invoice.file) {
    dataLogger.cloud('Uploading invoice file:', invoice.file.name);
    appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
  }

  const savedInvoice = await databaseService.createInvoice({ ...invoice, appwriteFileId });
  return { ...savedInvoice, file: invoice.file, appwriteFileId };
};

export const updateInvoice = async (invoice: Invoice): Promise<Invoice> => {
  let appwriteFileId = invoice.appwriteFileId;

  if (invoice.file && !invoice.appwriteFileId) {
    appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
  }

  return await databaseService.updateInvoice({ ...invoice, appwriteFileId });
};

export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  const invoices = await databaseService.getInvoices();
  const invoice = invoices.find(inv => inv.id === invoiceId);

  if (invoice?.appwriteFileId) {
    try {
      await storageService.deleteFile(invoice.appwriteFileId);
    } catch (error) {
      console.warn('Could not delete file from storage:', error);
    }
  }

  await databaseService.deleteInvoice(invoiceId);
};

export const createEntry = async (entry: AccountingEntry): Promise<AccountingEntry> =>
  databaseService.createEntry(entry);

export const updateEntry = async (entry: AccountingEntry): Promise<AccountingEntry> =>
  databaseService.updateEntry(entry);

export const deleteEntry = async (entryId: string): Promise<void> =>
  databaseService.deleteEntry(entryId);

export const createTransaction = async (transaction: BankTransaction): Promise<BankTransaction> =>
  databaseService.createTransaction(transaction);

export const saveSettings = async (settings: AppSettings): Promise<AppSettings> =>
  databaseService.saveSettings(settings);

export const getSettings = async (): Promise<AppSettings | null> =>
  databaseService.getSettings();

export const syncSettings = async (localSettings: AppSettings): Promise<AppSettings | null> => {
  try {
    const remoteSettings = await databaseService.getSettings();

    if (!remoteSettings) {
      await databaseService.saveSettings(localSettings);
      return localSettings;
    }

    return {
      ...localSettings,
      ...remoteSettings,
      dataConfig: localSettings.dataConfig
    };
  } catch (error) {
    console.error('Error syncing settings:', error);
    return null;
  }
};

export const loadAllData = async () => {
  const [invoices, entries, transactions] = await Promise.all([
    databaseService.getInvoices(),
    databaseService.getEntries(),
    databaseService.getTransactions()
  ]);
  return { invoices, entries, transactions };
};

export const fetchInvoices = () => databaseService.getInvoices();
export const fetchEntries = () => databaseService.getEntries();
export const fetchTransactions = () => databaseService.getTransactions();
export const fetchSuppliers = () => databaseService.getSuppliers();

export const createSupplier = (supplier: Supplier) => databaseService.createSupplier(supplier);
export const updateSupplier = (supplier: Supplier) => databaseService.updateSupplier(supplier);
export const deleteSupplier = (id: string) => databaseService.deleteSupplier(id);

// --- APARTMENTS (NEW) ---
export const fetchApartments = () => databaseService.getApartments();
export const createApartment = (apartment: Apartment) => databaseService.createApartment(apartment);
export const updateApartment = (apartment: Apartment) => databaseService.updateApartment(apartment);
export const deleteApartment = (id: string) => databaseService.deleteApartment(id);

// --- RECURRING EXPENSES (NEW) ---
export const fetchRecurringExpenses = () => databaseService.getRecurringExpenses();
export const createRecurringExpense = (expense: RecurringExpense) => databaseService.createRecurringExpense(expense);
export const updateRecurringExpense = (expense: RecurringExpense) => databaseService.updateRecurringExpense(expense);
export const deleteRecurringExpense = (id: string) => databaseService.deleteRecurringExpense(id);

// --- AI MATCH HISTORY (NEW) ---
export const fetchAIMatchHistory = () => databaseService.getAIMatchHistory();
export const createAIMatchHistory = (match: AIMatchHistory) => databaseService.createAIMatchHistory(match);
export const updateAIMatchHistory = (match: AIMatchHistory) => databaseService.updateAIMatchHistory(match);
export const deleteAIMatchHistory = (id: string) => databaseService.deleteAIMatchHistory(id);
export const findMatchByBankConcept = (concept: string) => databaseService.findMatchByBankConcept(concept);

// --- RESERVATIONS (NEW) ---
export const fetchReservations = () => databaseService.getReservations();
export const createReservation = (reservation: Reservation) => databaseService.createReservation(reservation);
export const createReservations = (reservations: Reservation[]) => databaseService.createReservations(reservations);
export const updateReservation = (reservation: Reservation) => databaseService.updateReservation(reservation);
export const deleteReservation = (id: string) => databaseService.deleteReservation(id);

export default {
  initialize: initializeAppwrite,
  database: databaseService,
  storage: storageService,
  realtime: realtimeService
};
