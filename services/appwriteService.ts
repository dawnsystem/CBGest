import { Client, Account, Databases, Storage, Query, ID, Models } from 'appwrite';
import { AppwriteConfig, Invoice, AccountingEntry, BankTransaction, AppSettings, AppUser, Supplier, Notification, QueueItem } from '../types';

// Singleton Client
let clientInstance: Client | null = null;
let accountInstance: Account | null = null;
let databasesInstance: Databases | null = null;
let storageInstance: Storage | null = null;

let currentConfig: AppwriteConfig | null = null;

// Connection state tracking
let connectionHealthy: boolean = false;
let lastConnectionCheck: number = 0;
const CONNECTION_CHECK_INTERVAL = 30000; // 30 seconds

// Error callbacks for UI feedback
type ErrorCallback = (error: string, operation: string) => void;
type SuccessCallback = (operation: string) => void;
let onErrorCallback: ErrorCallback | null = null;
let onSuccessCallback: SuccessCallback | null = null;

/**
 * Set callbacks for error/success notifications
 */
export const setNotificationCallbacks = (
  onError: ErrorCallback,
  onSuccess?: SuccessCallback
) => {
  onErrorCallback = onError;
  onSuccessCallback = onSuccess || null;
};

/**
 * Notify error to UI
 */
const notifyError = (error: string, operation: string) => {
  console.error(`❌ [${operation}]`, error);
  if (onErrorCallback) {
    onErrorCallback(error, operation);
  }
};

/**
 * Notify success to UI (optional)
 */
const notifySuccess = (operation: string) => {
  if (onSuccessCallback) {
    onSuccessCallback(operation);
  }
};

/**
 * Retry operation with exponential backoff
 */
const withRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        console.log(`✅ [${operationName}] Succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      const nonRetryableCodes = [401, 403, 404, 409];
      if (nonRetryableCodes.includes(error?.code)) {
        throw error;
      }

      // Retry on network/server errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`⚠️ [${operationName}] Attempt ${attempt + 1} failed, retrying in ${delay/1000}s...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Get connection health status
 */
export const getConnectionHealth = (): boolean => connectionHealthy;

/**
 * Set connection health status
 */
export const setConnectionHealth = (healthy: boolean) => {
  connectionHealthy = healthy;
};

/**
 * Initialize Appwrite client with configuration
 */
export const initializeAppwrite = (config: AppwriteConfig) => {
  if (!config.endpoint || !config.projectId) {
    throw new Error('Appwrite endpoint and projectId are required');
  }

  clientInstance = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);

  accountInstance = new Account(clientInstance);
  databasesInstance = new Databases(clientInstance);
  storageInstance = new Storage(clientInstance);

  currentConfig = config;

  console.log('✅ Appwrite initialized:', config.endpoint);
};

/**
 * Check if Appwrite is initialized
 */
export const isAppwriteInitialized = (): boolean => {
  return !!(clientInstance && accountInstance && databasesInstance && storageInstance && currentConfig);
};

/**
 * Test connection to Appwrite - comprehensive check
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    if (!accountInstance || !databasesInstance || !currentConfig) {
      console.error('❌ Appwrite not initialized');
      connectionHealthy = false;
      return false;
    }

    // Try to get account (validates auth)
    await accountInstance.get().catch((error) => {
      // 401 is expected if not logged in - connection still works
      if (error?.code !== 401) {
        throw error;
      }
    });

    connectionHealthy = true;
    lastConnectionCheck = Date.now();
    console.log('✅ Appwrite connection test successful');
    return true;
  } catch (error: any) {
    console.error('❌ Connection test failed:', error?.message || error);
    connectionHealthy = false;
    return false;
  }
};

/**
 * Verify that required collections exist
 * Returns object with collection status
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

  if (!databasesInstance || !currentConfig) {
    result.success = false;
    result.errors.push('Appwrite no inicializado');
    return result;
  }

  const collectionsToCheck = [
    { id: currentConfig.invoicesCollectionId, name: 'Facturas' },
    { id: currentConfig.entriesCollectionId, name: 'Asientos' },
    { id: currentConfig.transactionsCollectionId, name: 'Transacciones' },
    { id: currentConfig.settingsCollectionId, name: 'Configuración' },
    { id: currentConfig.suppliersCollectionId, name: 'Proveedores' },
  ];

  for (const col of collectionsToCheck) {
    try {
      // Try to list documents (limit 1) to verify collection exists and is accessible
      await databasesInstance.listDocuments(
        currentConfig.databaseId,
        col.id,
        [Query.limit(1)]
      );
      result.collections[col.name] = true;
      console.log(`✅ Colección '${col.name}' accesible`);
    } catch (error: any) {
      result.collections[col.name] = false;
      result.success = false;

      if (error?.code === 404) {
        result.errors.push(`Colección '${col.name}' no existe. Ejecuta el script de setup.`);
      } else if (error?.code === 401) {
        result.errors.push(`Sin permisos para acceder a '${col.name}'. Verifica la autenticación.`);
      } else {
        result.errors.push(`Error en '${col.name}': ${error?.message || 'Error desconocido'}`);
      }
      console.error(`❌ Colección '${col.name}':`, error?.message);
    }
  }

  return result;
};

/**
 * Full health check - connection + collections
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

  // Check initialization
  if (!clientInstance || !accountInstance || !databasesInstance || !currentConfig) {
    result.errors.push('Appwrite no está inicializado');
    return result;
  }

  // Check connection
  try {
    const connectionOk = await testConnection();
    result.connected = connectionOk;
    if (!connectionOk) {
      result.errors.push('No se puede conectar con Appwrite');
      return result;
    }
  } catch (error: any) {
    result.errors.push(`Error de conexión: ${error?.message}`);
    return result;
  }

  // Check authentication
  try {
    const user = await accountInstance.get();
    result.authenticated = !!user;
    if (!user) {
      result.errors.push('Usuario no autenticado');
    }
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

/**
 * Get current Appwrite client instances
 */
const getInstances = () => {
  if (!clientInstance || !accountInstance || !databasesInstance || !storageInstance || !currentConfig) {
    throw new Error('Appwrite not initialized. Call initializeAppwrite() first.');
  }
  return {
    client: clientInstance,
    account: accountInstance,
    databases: databasesInstance,
    storage: storageInstance,
    config: currentConfig
  };
};

// ============================================================================
// AUTH SERVICES
// ============================================================================

export const authService = {
  /**
   * Register new user with email/password
   */
  async register(email: string, password: string, name: string): Promise<AppUser> {
    const { account } = getInstances();

    try {
      const user = await account.create(ID.unique(), email, password, name);

      // Auto-login after registration
      await account.createEmailPasswordSession(email, password);

      return user as AppUser;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Error al registrar usuario');
    }
  },

  /**
   * Login with email/password
   */
  async login(email: string, password: string): Promise<AppUser> {
    const { account } = getInstances();

    try {
      // Check if session already exists
      try {
        const existingUser = await account.get();
        if (existingUser) {
          // Already logged in, delete current session first
          await account.deleteSession('current');
        }
      } catch {
        // No session exists, continue with login
      }

      await account.createEmailPasswordSession(email, password);
      const user = await account.get();
      return user as AppUser;
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Credenciales incorrectas');
    }
  },

  /**
   * Logout current session
   */
  async logout(): Promise<void> {
    const { account } = getInstances();

    try {
      await account.deleteSession('current');
    } catch (error: any) {
      console.error('Logout error:', error);
      throw new Error(error.message || 'Error al cerrar sesión');
    }
  },

  /**
   * Get current logged in user
   */
  async getCurrentUser(): Promise<AppUser | null> {
    const { account } = getInstances();

    try {
      const user = await account.get();
      return user as AppUser;
    } catch (error: any) {
      // Silently return null for expected auth errors (401, not logged in)
      if (error?.code === 401 || error?.type === 'general_unauthorized_scope') {
        return null;
      }
      // Log unexpected errors
      console.error('Unexpected error getting current user:', error);
      return null;
    }
  },

  /**
   * Update user name
   */
  async updateName(name: string): Promise<AppUser> {
    const { account } = getInstances();

    try {
      const user = await account.updateName(name);
      return user as AppUser;
    } catch (error: any) {
      console.error('Update name error:', error);
      throw new Error(error.message || 'Error al actualizar nombre');
    }
  },

  /**
   * Send password recovery email
   */
  async recoverPassword(email: string, resetUrl: string): Promise<void> {
    const { account } = getInstances();

    try {
      await account.createRecovery(email, resetUrl);
    } catch (error: any) {
      console.error('Password recovery error:', error);
      throw new Error(error.message || 'Error al enviar email de recuperación');
    }
  }
};

// ============================================================================
// DATABASE SERVICES
// ============================================================================

export const databaseService = {
  /**
   * Create Invoice document
   */
  async createInvoice(invoice: Invoice): Promise<Invoice> {
    const { databases, config } = getInstances();

    try {
      // Remove File object and id fields from invoice before saving
      // id and appwriteId are managed by Appwrite ($id), not as document attributes
      const { file, history, id, appwriteId, ...restInvoiceData } = invoice;

      // Serialize history array to JSON string (Appwrite doesn't support arrays of objects)
      const invoiceData = {
        ...restInvoiceData,
        history: history ? JSON.stringify(history) : undefined
      };

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.invoicesCollectionId,
          invoice.id || ID.unique(),
          invoiceData
        ),
        'createInvoice'
      );

      // Parse history back to array when returning and map appwriteId
      const parsedDoc = {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history ? JSON.parse(doc.history as string) : []
      };

      notifySuccess('Factura guardada');
      connectionHealthy = true;
      return parsedDoc as unknown as Invoice;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al crear factura';
      notifyError(errorMsg, 'createInvoice');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Get all invoices
   */
  async getInvoices(): Promise<Invoice[]> {
    const { databases, config } = getInstances();

    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.invoicesCollectionId,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getInvoices'
      );

      connectionHealthy = true;
      // Parse history from JSON string back to array and map appwriteId for each invoice
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history && typeof doc.history === 'string'
          ? JSON.parse(doc.history)
          : (doc.history || [])
      })) as unknown as Invoice[];
    } catch (error: any) {
      const errorMsg = error.message || 'Error al obtener facturas';
      notifyError(errorMsg, 'getInvoices');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Update Invoice
   */
  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    const { databases, config } = getInstances();

    try {
      // Remove id and appwriteId - these are managed by Appwrite ($id)
      const { file, history, id, appwriteId, ...restInvoiceData } = invoice;

      // Serialize history array to JSON string
      const invoiceData = {
        ...restInvoiceData,
        history: history ? JSON.stringify(history) : undefined
      };

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.invoicesCollectionId,
          invoice.id,
          invoiceData
        ),
        'updateInvoice'
      );

      // Parse history back to array when returning and map appwriteId
      const parsedDoc = {
        ...doc,
        file,
        id: doc.$id,
        appwriteId: doc.$id,
        history: doc.history ? JSON.parse(doc.history as string) : []
      };

      notifySuccess('Factura actualizada');
      connectionHealthy = true;
      return parsedDoc as unknown as Invoice;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al actualizar factura';
      notifyError(errorMsg, 'updateInvoice');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Delete Invoice
   */
  async deleteInvoice(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await withRetry(
        () => databases.deleteDocument(
          config.databaseId,
          config.invoicesCollectionId,
          id
        ),
        'deleteInvoice'
      );
      notifySuccess('Factura eliminada');
      connectionHealthy = true;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al eliminar factura';
      notifyError(errorMsg, 'deleteInvoice');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Create Accounting Entry
   */
  async createEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { referenceDoc, id, appwriteId, ...entryData } = entry;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.entriesCollectionId,
          id || ID.unique(),
          entryData
        ),
        'createEntry'
      );

      connectionHealthy = true;
      // Return with appwriteId mapped from $id
      return {
        ...doc,
        referenceDoc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as AccountingEntry;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al crear asiento';
      notifyError(errorMsg, 'createEntry');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Get all accounting entries
   */
  async getEntries(): Promise<AccountingEntry[]> {
    const { databases, config } = getInstances();

    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.entriesCollectionId,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getEntries'
      );

      connectionHealthy = true;
      // Map $id to appwriteId for each entry
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as AccountingEntry[];
    } catch (error: any) {
      const errorMsg = error.message || 'Error al obtener asientos';
      notifyError(errorMsg, 'getEntries');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Update Accounting Entry
   */
  async updateEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { referenceDoc, id, appwriteId, ...entryData } = entry;

      const docId = appwriteId || id;
      if (!docId) {
        throw new Error('Cannot update entry without ID');
      }

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.entriesCollectionId,
          docId,
          entryData
        ),
        'updateEntry'
      );

      connectionHealthy = true;
      // Return with appwriteId mapped from $id
      return {
        ...doc,
        referenceDoc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as AccountingEntry;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al actualizar asiento';
      notifyError(errorMsg, 'updateEntry');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Delete Accounting Entry
   */
  async deleteEntry(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await withRetry(
        () => databases.deleteDocument(
          config.databaseId,
          config.entriesCollectionId,
          id
        ),
        'deleteEntry'
      );
      connectionHealthy = true;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al eliminar asiento';
      notifyError(errorMsg, 'deleteEntry');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Create Bank Transaction
   */
  async createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...transactionData } = transaction;

      const doc = await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.transactionsCollectionId,
          id || ID.unique(),
          transactionData
        ),
        'createTransaction'
      );

      connectionHealthy = true;
      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as BankTransaction;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al crear transacción';
      notifyError(errorMsg, 'createTransaction');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Get all bank transactions
   */
  async getTransactions(): Promise<BankTransaction[]> {
    const { databases, config } = getInstances();

    try {
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.transactionsCollectionId,
          [Query.orderDesc('date'), Query.limit(1000)]
        ),
        'getTransactions'
      );

      connectionHealthy = true;
      // Map $id to appwriteId for each transaction
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as BankTransaction[];
    } catch (error: any) {
      const errorMsg = error.message || 'Error al obtener transacciones';
      notifyError(errorMsg, 'getTransactions');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Update Bank Transaction
   */
  async updateTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...transactionData } = transaction;

      const docId = appwriteId || id;
      if (!docId) {
        throw new Error('Cannot update transaction without ID');
      }

      const doc = await withRetry(
        () => databases.updateDocument(
          config.databaseId,
          config.transactionsCollectionId,
          docId,
          transactionData
        ),
        'updateTransaction'
      );

      connectionHealthy = true;
      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as BankTransaction;
    } catch (error: any) {
      const errorMsg = error.message || 'Error al actualizar transacción';
      notifyError(errorMsg, 'updateTransaction');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Save App Settings
   */
  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const { databases, config } = getInstances();

    try {
      // Try to get existing settings document
      const response = await withRetry(
        () => databases.listDocuments(
          config.databaseId,
          config.settingsCollectionId,
          [Query.limit(1)]
        ),
        'getSettingsForSave'
      );

      // Remove dataConfig field before saving (it's not in Appwrite schema)
      // Serialize partners array to JSON string for Appwrite storage
      const { dataConfig, partners, ...restSettings } = settings;
      const settingsToSave = {
        ...restSettings,
        partners: JSON.stringify(partners || [])
      };

      if (response.documents.length > 0) {
        // Update existing
        const doc = await withRetry(
          () => databases.updateDocument(
            config.databaseId,
            config.settingsCollectionId,
            response.documents[0].$id,
            settingsToSave
          ),
          'updateSettings'
        );
        // Parse partners back to array when returning
        const parsedDoc = {
          ...doc,
          partners: JSON.parse((doc as any).partners || '[]'),
          dataConfig
        };
        connectionHealthy = true;
        return parsedDoc as unknown as AppSettings;
      } else {
        // Create new
        const doc = await withRetry(
          () => databases.createDocument(
            config.databaseId,
            config.settingsCollectionId,
            ID.unique(),
            settingsToSave
          ),
          'createSettings'
        );
        // Parse partners back to array when returning
        const parsedDoc = {
          ...doc,
          partners: JSON.parse((doc as any).partners || '[]'),
          dataConfig
        };
        connectionHealthy = true;
        return parsedDoc as unknown as AppSettings;
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Error al guardar configuración';
      notifyError(errorMsg, 'saveSettings');
      connectionHealthy = false;
      throw new Error(errorMsg);
    }
  },

  /**
   * Get App Settings
   */
  async getSettings(): Promise<AppSettings | null> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.settingsCollectionId,
        [Query.limit(1)]
      );

      if (response.documents.length > 0) {
        const doc = response.documents[0] as any;
        // Parse partners from JSON string back to array
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

  /**
   * Create Supplier
   */
  async createSupplier(supplier: Supplier): Promise<Supplier> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...supplierData } = supplier;

      const doc = await databases.createDocument(
        config.databaseId,
        config.suppliersCollectionId,
        id || ID.unique(),
        supplierData
      );

      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as Supplier;
    } catch (error: any) {
      console.error('Create supplier error:', error);
      throw new Error(error.message || 'Error al crear proveedor');
    }
  },

  /**
   * Get all suppliers
   */
  async getSuppliers(): Promise<Supplier[]> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.suppliersCollectionId,
        [Query.orderAsc('name'), Query.limit(1000)]
      );

      // Map $id to appwriteId for each supplier
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Supplier[];
    } catch (error: any) {
      console.error('Get suppliers error:', error);
      throw new Error(error.message || 'Error al obtener proveedores');
    }
  },

  /**
   * Update Supplier
   */
  async updateSupplier(supplier: Supplier): Promise<Supplier> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...supplierData } = supplier;

      const docId = appwriteId || id;
      if (!docId) {
        throw new Error('Cannot update supplier without ID');
      }

      const doc = await databases.updateDocument(
        config.databaseId,
        config.suppliersCollectionId,
        docId,
        supplierData
      );

      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as Supplier;
    } catch (error: any) {
      console.error('Update supplier error:', error);
      throw new Error(error.message || 'Error al actualizar proveedor');
    }
  },

  /**
   * Delete Supplier
   */
  async deleteSupplier(appwriteId: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await databases.deleteDocument(
        config.databaseId,
        config.suppliersCollectionId,
        appwriteId
      );
    } catch (error: any) {
      console.error('Delete supplier error:', error);
      throw new Error(error.message || 'Error al eliminar proveedor');
    }
  },

  /**
   * Create Notification
   */
  async createNotification(notification: Notification): Promise<Notification> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...notificationData } = notification;

      const doc = await databases.createDocument(
        config.databaseId,
        config.notificationsCollectionId,
        id || ID.unique(),
        notificationData
      );

      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as Notification;
    } catch (error: any) {
      console.error('Create notification error:', error);
      throw new Error(error.message || 'Error al crear notificación');
    }
  },

  /**
   * Get all notifications
   */
  async getNotifications(): Promise<Notification[]> {
    const { databases, config } = getInstances();

    try {
      // Check if collectionId is defined
      if (!config.notificationsCollectionId) {
        console.warn('Notifications collection ID not configured');
        return [];
      }

      const response = await databases.listDocuments(
        config.databaseId,
        config.notificationsCollectionId,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      );

      // Map $id to appwriteId for each notification
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      })) as unknown as Notification[];
    } catch (error: any) {
      // Silently handle expected errors (collection not found, not authorized)
      if (error?.code === 404 || error?.code === 401 ||
          error?.message?.includes('not found') ||
          error?.message?.includes('not be found')) {
        return [];
      }
      console.error('Get notifications error:', error);
      throw new Error(error.message || 'Error al obtener notificaciones');
    }
  },

  /**
   * Update Notification (mainly for marking as read)
   */
  async updateNotification(notification: Notification): Promise<Notification> {
    const { databases, config } = getInstances();

    try {
      // Remove fields that shouldn't be sent to Appwrite
      const { id, appwriteId, ...notificationData } = notification;

      const docId = appwriteId || id;
      if (!docId) {
        throw new Error('Cannot update notification without ID');
      }

      const doc = await databases.updateDocument(
        config.databaseId,
        config.notificationsCollectionId,
        docId,
        notificationData
      );

      // Return with appwriteId mapped from $id
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id
      } as unknown as Notification;
    } catch (error: any) {
      console.error('Update notification error:', error);
      throw new Error(error.message || 'Error al actualizar notificación');
    }
  },

  /**
   * Delete Notification
   */
  async deleteNotification(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await databases.deleteDocument(
        config.databaseId,
        config.notificationsCollectionId,
        id
      );
    } catch (error: any) {
      console.error('Delete notification error:', error);
      throw new Error(error.message || 'Error al eliminar notificación');
    }
  },

  /**
   * Delete all notifications
   */
  async deleteAllNotifications(): Promise<void> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.notificationsCollectionId,
        [Query.limit(100)]
      );

      // Delete all notifications in batch
      await Promise.all(
        response.documents.map(doc =>
          databases.deleteDocument(
            config.databaseId,
            config.notificationsCollectionId,
            doc.$id
          )
        )
      );
    } catch (error: any) {
      console.error('Delete all notifications error:', error);
      throw new Error(error.message || 'Error al eliminar notificaciones');
    }
  },

  /**
   * Create Upload Queue Item
   */
  async createUploadItem(item: QueueItem): Promise<QueueItem> {
    const { databases, config } = getInstances();

    try {
      // Remove File object before saving (not JSON serializable)
      // Also remove result/bankResult objects as they're complex nested types
      const { file, result, bankResult, ...itemData } = item;

      // Ensure progress is an integer (Appwrite requires integer type)
      const dataToSave = {
        ...itemData,
        progress: Math.round(itemData.progress || 0),
        // Serialize complex objects to JSON strings if they exist
        result: result ? JSON.stringify(result) : undefined,
        bankResult: bankResult ? JSON.stringify(bankResult) : undefined
      };

      // Remove id field as it shouldn't be sent to Appwrite
      const { id, ...dataToSaveWithoutId } = dataToSave;

      const doc = await databases.createDocument(
        config.databaseId,
        config.uploadsCollectionId,
        item.id || ID.unique(),
        dataToSaveWithoutId
      );

      // Return with id mapped from $id
      return {
        ...doc,
        file,
        result,
        bankResult,
        id: doc.$id
      } as unknown as QueueItem;
    } catch (error: any) {
      console.error('Create upload item error:', error);
      throw new Error(error.message || 'Error al crear elemento de cola');
    }
  },

  /**
   * Get all upload queue items
   */
  async getUploadQueue(): Promise<QueueItem[]> {
    const { databases, config } = getInstances();

    try {
      // Check if collectionId is defined
      if (!config.uploadsCollectionId) {
        console.warn('Uploads collection ID not configured');
        return [];
      }

      const response = await databases.listDocuments(
        config.databaseId,
        config.uploadsCollectionId,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      );

      // Note: File objects need to be reconstructed from base64Data on the client side
      // Parse JSON strings back to objects for result and bankResult
      // Map $id to id for each item
      return response.documents.map((doc: any) => ({
        ...doc,
        id: doc.$id,
        result: doc.result && typeof doc.result === 'string'
          ? JSON.parse(doc.result)
          : doc.result,
        bankResult: doc.bankResult && typeof doc.bankResult === 'string'
          ? JSON.parse(doc.bankResult)
          : doc.bankResult
      })) as unknown as QueueItem[];
    } catch (error: any) {
      // Silently handle expected errors (collection not found, not authorized)
      if (error?.code === 404 || error?.code === 401 ||
          error?.message?.includes('not found') ||
          error?.message?.includes('not be found')) {
        return [];
      }
      console.error('Get upload queue error:', error);
      throw new Error(error.message || 'Error al obtener cola de uploads');
    }
  },

  /**
   * Update Upload Queue Item
   */
  async updateUploadItem(item: QueueItem): Promise<QueueItem> {
    const { databases, config } = getInstances();

    try {
      // Remove File object before saving (not JSON serializable)
      // Also remove result/bankResult objects as they're complex nested types
      const { file, result, bankResult, id, ...itemData } = item;

      // Ensure progress is an integer (Appwrite requires integer type)
      const dataToSave = {
        ...itemData,
        progress: Math.round(itemData.progress || 0),
        // Serialize complex objects to JSON strings if they exist
        result: result ? JSON.stringify(result) : undefined,
        bankResult: bankResult ? JSON.stringify(bankResult) : undefined
      };

      if (!id) {
        throw new Error('Cannot update upload item without ID');
      }

      const doc = await databases.updateDocument(
        config.databaseId,
        config.uploadsCollectionId,
        id,
        dataToSave
      );

      // Return with id mapped from $id
      return {
        ...doc,
        file,
        result,
        bankResult,
        id: doc.$id
      } as unknown as QueueItem;
    } catch (error: any) {
      console.error('Update upload item error:', error);
      throw new Error(error.message || 'Error al actualizar elemento de cola');
    }
  },

  /**
   * Delete Upload Queue Item
   */
  async deleteUploadItem(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await databases.deleteDocument(
        config.databaseId,
        config.uploadsCollectionId,
        id
      );
    } catch (error: any) {
      console.error('Delete upload item error:', error);
      throw new Error(error.message || 'Error al eliminar elemento de cola');
    }
  },

  /**
   * Delete completed upload queue items
   */
  async deleteCompletedUploads(): Promise<void> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.uploadsCollectionId,
        [Query.equal('status', 'COMPLETED'), Query.limit(100)]
      );

      await Promise.all(
        response.documents.map(doc =>
          databases.deleteDocument(
            config.databaseId,
            config.uploadsCollectionId,
            doc.$id
          )
        )
      );
    } catch (error: any) {
      console.error('Delete completed uploads error:', error);
      throw new Error(error.message || 'Error al eliminar uploads completados');
    }
  }
};

// ============================================================================
// STORAGE SERVICES
// ============================================================================

export const storageService = {
  /**
   * Upload file to Appwrite Storage
   */
  async uploadFile(file: File, id?: string): Promise<string> {
    const { storage, config } = getInstances();

    try {
      const uploadedFile = await storage.createFile(
        config.storageBucketId,
        id || ID.unique(),
        file
      );

      return uploadedFile.$id;
    } catch (error: any) {
      console.error('Upload file error:', error);
      throw new Error(error.message || 'Error al subir archivo');
    }
  },

  /**
   * Get file download URL
   */
  getFileUrl(fileId: string): string {
    const { config } = getInstances();

    return `${currentConfig?.endpoint}/storage/buckets/${config.storageBucketId}/files/${fileId}/view`;
  },

  /**
   * Download file as blob
   */
  async downloadFile(fileId: string): Promise<Blob> {
    const { storage, config } = getInstances();

    try {
      const file = await storage.getFileDownload(
        config.storageBucketId,
        fileId
      );

      return file as unknown as Blob;
    } catch (error: any) {
      console.error('Download file error:', error);
      throw new Error(error.message || 'Error al descargar archivo');
    }
  },

  /**
   * Delete file from storage
   */
  async deleteFile(fileId: string): Promise<void> {
    const { storage, config } = getInstances();

    try {
      await storage.deleteFile(config.storageBucketId, fileId);
    } catch (error: any) {
      console.error('Delete file error:', error);
      throw new Error(error.message || 'Error al eliminar archivo');
    }
  }
};

// ============================================================================
// REALTIME SUBSCRIPTIONS (Bonus)
// ============================================================================

export const realtimeService = {
  /**
   * Subscribe to invoices changes
   */
  subscribeToInvoices(callback: (payload: any) => void) {
    const { client, config } = getInstances();

    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.invoicesCollectionId}.documents`,
      callback
    );
  },

  /**
   * Subscribe to entries changes
   */
  subscribeToEntries(callback: (payload: any) => void) {
    const { client, config } = getInstances();

    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.entriesCollectionId}.documents`,
      callback
    );
  },

  /**
   * Subscribe to transactions changes
   */
  subscribeToTransactions(callback: (payload: any) => void) {
    const { client, config } = getInstances();

    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.transactionsCollectionId}.documents`,
      callback
    );
  }
};

/**
 * Subscribe to all collection changes
 * Returns an unsubscribe function that cleans up all subscriptions
 */
export const subscribeToChanges = (callback: (payload: any) => void): (() => void) => {
  const unsubscribeInvoices = realtimeService.subscribeToInvoices(callback);
  const unsubscribeEntries = realtimeService.subscribeToEntries(callback);
  const unsubscribeTransactions = realtimeService.subscribeToTransactions(callback);

  // Return a function that unsubscribes from all collections
  return () => {
    unsubscribeInvoices();
    unsubscribeEntries();
    unsubscribeTransactions();
  };
};

// ============================================================================
// CONVENIENCE FUNCTIONS (Wrapper functions for complete operations)
// ============================================================================

/**
 * Create Invoice with file upload to storage
 * This handles both the file upload to bucket and document creation
 */
export const createInvoice = async (invoice: Invoice): Promise<Invoice> => {
  try {
    let appwriteFileId: string | undefined;

    // 1. Upload file to storage if it exists
    if (invoice.file) {
      console.log('📤 Uploading invoice file to Appwrite storage:', invoice.file.name);
      appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
      console.log('✅ File uploaded with ID:', appwriteFileId);
    }

    // 2. Create invoice document with file reference
    const invoiceToSave = {
      ...invoice,
      appwriteFileId // Store the file ID from storage
    };

    const savedInvoice = await databaseService.createInvoice(invoiceToSave);

    // 3. Return invoice with both file object and appwriteFileId
    return {
      ...savedInvoice,
      file: invoice.file,
      appwriteFileId
    };
  } catch (error: any) {
    console.error('Error creating invoice with file:', error);
    throw error;
  }
};

/**
 * Update Invoice (with optional file update)
 */
export const updateInvoice = async (invoice: Invoice): Promise<Invoice> => {
  try {
    let appwriteFileId = invoice.appwriteFileId;

    // If there's a new file, upload it
    if (invoice.file && !invoice.appwriteFileId) {
      console.log('📤 Uploading new file for invoice update:', invoice.file.name);
      appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
      console.log('✅ New file uploaded with ID:', appwriteFileId);
    }

    const invoiceToUpdate = {
      ...invoice,
      appwriteFileId
    };

    return await databaseService.updateInvoice(invoiceToUpdate);
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    throw error;
  }
};

/**
 * Delete Invoice (also deletes associated file from storage)
 */
export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  try {
    // First get the invoice to find the file ID
    const invoices = await databaseService.getInvoices();
    const invoice = invoices.find(inv => inv.id === invoiceId);

    // Delete file from storage if it exists
    if (invoice?.appwriteFileId) {
      console.log('🗑️ Deleting file from storage:', invoice.appwriteFileId);
      try {
        await storageService.deleteFile(invoice.appwriteFileId);
        console.log('✅ File deleted from storage');
      } catch (error) {
        console.warn('Could not delete file from storage (might not exist):', error);
      }
    }

    // Delete invoice document
    await databaseService.deleteInvoice(invoiceId);
  } catch (error: any) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
};

/**
 * Create Accounting Entry
 */
export const createEntry = async (entry: AccountingEntry): Promise<AccountingEntry> => {
  return await databaseService.createEntry(entry);
};

/**
 * Update Accounting Entry
 */
export const updateEntry = async (entry: AccountingEntry): Promise<AccountingEntry> => {
  return await databaseService.updateEntry(entry);
};

/**
 * Delete Accounting Entry
 */
export const deleteEntry = async (entryId: string): Promise<void> => {
  return await databaseService.deleteEntry(entryId);
};

/**
 * Create Bank Transaction
 */
export const createTransaction = async (transaction: BankTransaction): Promise<BankTransaction> => {
  return await databaseService.createTransaction(transaction);
};

/**
 * Save Settings
 */
export const saveSettings = async (settings: AppSettings): Promise<AppSettings> => {
  return await databaseService.saveSettings(settings);
};

/**
 * Get Settings
 */
export const getSettings = async (): Promise<AppSettings | null> => {
  return await databaseService.getSettings();
};

/**
 * Sync settings between local and Appwrite
 * This function merges local settings with remote settings
 */
export const syncSettings = async (localSettings: AppSettings): Promise<AppSettings | null> => {
  try {
    const remoteSettings = await databaseService.getSettings();

    if (!remoteSettings) {
      // No remote settings, save local to cloud
      console.log('No remote settings found, saving local settings to Appwrite');
      await databaseService.saveSettings(localSettings);
      return localSettings;
    }

    // Merge settings (remote takes precedence for non-config fields)
    const merged = {
      ...localSettings,
      ...remoteSettings,
      // Keep local dataConfig since it contains connection info
      dataConfig: localSettings.dataConfig
    };

    return merged;
  } catch (error) {
    console.error('Error syncing settings:', error);
    return null;
  }
};

/**
 * Load all data from Appwrite
 */
export const loadAllData = async (): Promise<{
  invoices: Invoice[];
  entries: AccountingEntry[];
  transactions: BankTransaction[];
}> => {
  const [invoices, entries, transactions] = await Promise.all([
    databaseService.getInvoices(),
    databaseService.getEntries(),
    databaseService.getTransactions()
  ]);

  return { invoices, entries, transactions };
};

/**
 * Fetch invoices (alias for getInvoices)
 */
export const fetchInvoices = async (): Promise<Invoice[]> => {
  return await databaseService.getInvoices();
};

/**
 * Fetch entries (alias for getEntries)
 */
export const fetchEntries = async (): Promise<AccountingEntry[]> => {
  return await databaseService.getEntries();
};

/**
 * Fetch transactions (alias for getTransactions)
 */
export const fetchTransactions = async (): Promise<BankTransaction[]> => {
  return await databaseService.getTransactions();
};

// ========================================
// SUPPLIER CRUD OPERATIONS
// ========================================

/**
 * Create Supplier
 */
export const createSupplier = async (supplier: Supplier): Promise<Supplier> => {
  try {
    const savedSupplier = await databaseService.createSupplier(supplier);
    return savedSupplier;
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    throw error;
  }
};

/**
 * Update Supplier
 */
export const updateSupplier = async (supplier: Supplier): Promise<Supplier> => {
  try {
    if (!supplier.appwriteId) {
      throw new Error('Cannot update supplier without appwriteId');
    }
    const updatedSupplier = await databaseService.updateSupplier(supplier);
    return updatedSupplier;
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    throw error;
  }
};

/**
 * Delete Supplier
 */
export const deleteSupplier = async (appwriteId: string): Promise<void> => {
  try {
    await databaseService.deleteSupplier(appwriteId);
  } catch (error: any) {
    console.error('Error deleting supplier:', error);
    throw error;
  }
};

/**
 * Fetch all suppliers
 */
export const fetchSuppliers = async (): Promise<Supplier[]> => {
  return await databaseService.getSuppliers();
};

export default {
  initialize: initializeAppwrite,
  auth: authService,
  database: databaseService,
  storage: storageService,
  realtime: realtimeService
};
