/**
 * @fileoverview Servicios de Appwrite para CBGest
 * @description Servicios de base de datos, almacenamiento y realtime.
 *              La autenticación está en authService.ts separado.
 *              Las instancias del cliente están en lib/appwrite/client.ts
 */

import { Query, ID } from 'appwrite';
import { client, account, databases, storage, config } from '../lib/appwrite/client';
import { authService } from './authService';
import type {
  Invoice,
  AccountingEntry,
  BankTransaction,
  AppSettings,
  AppUser,
  Supplier,
  Notification,
  QueueItem
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
        console.log(`[${operationName}] Succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // GLOBAL 401 HANDLER: Notificar sesión expirada
      if (error?.code === 401) {
        console.warn(`[${operationName}] Error 401 detectado - notificando sesión expirada`);
        authService.handleUnauthorizedError();
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
  console.log('[appwriteService] initializeAppwrite called - client already initialized via lib/appwrite/client.ts');
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
    console.log('Appwrite connection test successful');
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
      console.log(`Colección '${col.name}' accesible`);
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
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        file, history, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...restInvoiceData
      } = invoice as any;
      const invoiceData = {
        ...restInvoiceData,
        history: history ? JSON.stringify(history) : undefined
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

      return {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history ? JSON.parse(doc.history as string) : []
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
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history && typeof doc.history === 'string'
          ? JSON.parse(doc.history)
          : (doc.history || [])
      })) as unknown as Invoice[];
    } catch (error: any) {
      notifyError(error.message, 'getInvoices');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        file, history, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...restInvoiceData
      } = invoice as any;
      const invoiceData = {
        ...restInvoiceData,
        history: history ? JSON.stringify(history) : undefined
      };

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.collections.invoices,
          invoice.id,
          invoiceData
        ),
        'updateInvoice'
      );

      notifySuccess('Factura actualizada');
      connectionHealthy = true;

      return {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history ? JSON.parse(doc.history as string) : []
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
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        referenceDoc, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...entryData
      } = entry as any;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.entries,
          id || ID.unique(),
          entryData
        ),
        'createEntry'
      );

      connectionHealthy = true;
      return { ...doc, referenceDoc, id: doc.$id, appwriteId: doc.$id } as unknown as AccountingEntry;
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
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as AccountingEntry[];
    } catch (error: any) {
      notifyError(error.message, 'getEntries');
      connectionHealthy = false;
      throw error;
    }
  },

  async updateEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    try {
      // Excluir campos que Appwrite gestiona automáticamente
      const {
        referenceDoc, id, appwriteId,
        createdAt, updatedAt,
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...entryData
      } = entry as any;
      const docId = appwriteId || id;

      const doc = await withRetry(
        () => databases.updateDocument(config.databaseId, config.collections.entries, docId, entryData),
        'updateEntry'
      );

      connectionHealthy = true;
      return { ...doc, referenceDoc, id: doc.$id, appwriteId: doc.$id } as unknown as AccountingEntry;
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
      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.settings,
        [Query.limit(1)]
      );

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

      const doc = await databases.createDocument(
        config.databaseId,
        config.collections.suppliers,
        id || ID.unique(),
        supplierData
      );

      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
    } catch (error: any) {
      console.error('Create supplier error:', error);
      throw error;
    }
  },

  async getSuppliers(): Promise<Supplier[]> {
    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.suppliers,
        [Query.orderAsc('name'), Query.limit(1000)]
      );

      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Supplier[];
    } catch (error: any) {
      console.error('Get suppliers error:', error);
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

      const doc = await databases.updateDocument(
        config.databaseId,
        config.collections.suppliers,
        docId,
        supplierData
      );

      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
    } catch (error: any) {
      console.error('Update supplier error:', error);
      throw error;
    }
  },

  async deleteSupplier(appwriteId: string): Promise<void> {
    try {
      await databases.deleteDocument(config.databaseId, config.collections.suppliers, appwriteId);
    } catch (error: any) {
      console.error('Delete supplier error:', error);
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

      const doc = await databases.createDocument(
        config.databaseId,
        config.collections.notifications,
        id || ID.unique(),
        notificationData
      );

      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
    } catch (error: any) {
      console.error('Create notification error:', error);
      throw error;
    }
  },

  async getNotifications(): Promise<Notification[]> {
    try {
      if (!config.collections.notifications) return [];

      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.notifications,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      );

      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Notification[];
    } catch (error: any) {
      if (error?.code === 404 || error?.code === 401) return [];
      console.error('Get notifications error:', error);
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

      const doc = await databases.updateDocument(
        config.databaseId,
        config.collections.notifications,
        docId,
        notificationData
      );

      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
    } catch (error: any) {
      console.error('Update notification error:', error);
      throw error;
    }
  },

  async deleteNotification(id: string): Promise<void> {
    try {
      await databases.deleteDocument(config.databaseId, config.collections.notifications, id);
    } catch (error: any) {
      console.error('Delete notification error:', error);
      throw error;
    }
  },

  async deleteAllNotifications(): Promise<void> {
    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.notifications,
        [Query.limit(100)]
      );

      await Promise.all(
        response.documents.map(doc =>
          databases.deleteDocument(config.databaseId, config.collections.notifications, doc.$id)
        )
      );
    } catch (error: any) {
      console.error('Delete all notifications error:', error);
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

      const doc = await databases.createDocument(
        config.databaseId,
        config.collections.uploads,
        id || ID.unique(),
        dataToSave
      );

      return { ...doc, file, result, bankResult, id: doc.$id } as unknown as QueueItem;
    } catch (error: any) {
      console.error('Create upload item error:', error);
      throw error;
    }
  },

  async getUploadQueue(): Promise<QueueItem[]> {
    try {
      if (!config.collections.uploads) return [];

      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.uploads,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      );

      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        result: doc.result && typeof doc.result === 'string' ? JSON.parse(doc.result) : doc.result,
        bankResult: doc.bankResult && typeof doc.bankResult === 'string' ? JSON.parse(doc.bankResult) : doc.bankResult
      })) as unknown as QueueItem[];
    } catch (error: any) {
      if (error?.code === 404 || error?.code === 401) return [];
      console.error('Get upload queue error:', error);
      throw error;
    }
  },

  async updateUploadItem(item: QueueItem): Promise<QueueItem> {
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

      const doc = await databases.updateDocument(
        config.databaseId,
        config.collections.uploads,
        id,
        dataToSave
      );

      return { ...doc, file, result, bankResult, id: doc.$id } as unknown as QueueItem;
    } catch (error: any) {
      console.error('Update upload item error:', error);
      throw error;
    }
  },

  async deleteUploadItem(id: string): Promise<void> {
    try {
      await databases.deleteDocument(config.databaseId, config.collections.uploads, id);
    } catch (error: any) {
      console.error('Delete upload item error:', error);
      throw error;
    }
  },

  async deleteCompletedUploads(): Promise<void> {
    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.collections.uploads,
        [Query.equal('status', 'COMPLETED'), Query.limit(100)]
      );

      await Promise.all(
        response.documents.map(doc =>
          databases.deleteDocument(config.databaseId, config.collections.uploads, doc.$id)
        )
      );
    } catch (error: any) {
      console.error('Delete completed uploads error:', error);
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
    console.log('Uploading invoice file:', invoice.file.name);
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

export default {
  initialize: initializeAppwrite,
  database: databaseService,
  storage: storageService,
  realtime: realtimeService
};
