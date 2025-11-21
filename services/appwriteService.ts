import { Client, Account, Databases, Storage, Query, ID, Models } from 'appwrite';
import { AppwriteConfig, Invoice, AccountingEntry, BankTransaction, AppSettings, AppUser, Supplier } from '../types';

// Singleton Client
let clientInstance: Client | null = null;
let accountInstance: Account | null = null;
let databasesInstance: Databases | null = null;
let storageInstance: Storage | null = null;

let currentConfig: AppwriteConfig | null = null;

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
 * Test connection to Appwrite
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    if (!accountInstance) {
      throw new Error('Appwrite not initialized');
    }
    // Try to get account (this will work even without session)
    await accountInstance.get().catch(() => {
      // If not authenticated, that's OK - connection still works
      return true;
    });
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
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
    } catch (error) {
      // Not logged in
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
      // Remove File object from invoice before saving (not JSON serializable)
      const { file, ...invoiceData } = invoice;

      const doc = await databases.createDocument(
        config.databaseId,
        config.invoicesCollectionId,
        invoice.id || ID.unique(),
        invoiceData
      );

      return { ...doc, file } as Invoice;
    } catch (error: any) {
      console.error('Create invoice error:', error);
      throw new Error(error.message || 'Error al crear factura');
    }
  },

  /**
   * Get all invoices
   */
  async getInvoices(): Promise<Invoice[]> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.invoicesCollectionId,
        [Query.orderDesc('date'), Query.limit(1000)]
      );

      return response.documents as Invoice[];
    } catch (error: any) {
      console.error('Get invoices error:', error);
      throw new Error(error.message || 'Error al obtener facturas');
    }
  },

  /**
   * Update Invoice
   */
  async updateInvoice(invoice: Invoice): Promise<Invoice> {
    const { databases, config } = getInstances();

    try {
      const { file, ...invoiceData } = invoice;

      const doc = await databases.updateDocument(
        config.databaseId,
        config.invoicesCollectionId,
        invoice.id,
        invoiceData
      );

      return { ...doc, file } as Invoice;
    } catch (error: any) {
      console.error('Update invoice error:', error);
      throw new Error(error.message || 'Error al actualizar factura');
    }
  },

  /**
   * Delete Invoice
   */
  async deleteInvoice(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await databases.deleteDocument(
        config.databaseId,
        config.invoicesCollectionId,
        id
      );
    } catch (error: any) {
      console.error('Delete invoice error:', error);
      throw new Error(error.message || 'Error al eliminar factura');
    }
  },

  /**
   * Create Accounting Entry
   */
  async createEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    const { databases, config } = getInstances();

    try {
      const { referenceDoc, ...entryData } = entry;

      const doc = await databases.createDocument(
        config.databaseId,
        config.entriesCollectionId,
        entry.id || ID.unique(),
        entryData
      );

      return { ...doc, referenceDoc } as AccountingEntry;
    } catch (error: any) {
      console.error('Create entry error:', error);
      throw new Error(error.message || 'Error al crear asiento');
    }
  },

  /**
   * Get all accounting entries
   */
  async getEntries(): Promise<AccountingEntry[]> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.entriesCollectionId,
        [Query.orderDesc('date'), Query.limit(1000)]
      );

      return response.documents as AccountingEntry[];
    } catch (error: any) {
      console.error('Get entries error:', error);
      throw new Error(error.message || 'Error al obtener asientos');
    }
  },

  /**
   * Update Accounting Entry
   */
  async updateEntry(entry: AccountingEntry): Promise<AccountingEntry> {
    const { databases, config } = getInstances();

    try {
      const { referenceDoc, ...entryData } = entry;

      const doc = await databases.updateDocument(
        config.databaseId,
        config.entriesCollectionId,
        entry.id,
        entryData
      );

      return { ...doc, referenceDoc } as AccountingEntry;
    } catch (error: any) {
      console.error('Update entry error:', error);
      throw new Error(error.message || 'Error al actualizar asiento');
    }
  },

  /**
   * Delete Accounting Entry
   */
  async deleteEntry(id: string): Promise<void> {
    const { databases, config } = getInstances();

    try {
      await databases.deleteDocument(
        config.databaseId,
        config.entriesCollectionId,
        id
      );
    } catch (error: any) {
      console.error('Delete entry error:', error);
      throw new Error(error.message || 'Error al eliminar asiento');
    }
  },

  /**
   * Create Bank Transaction
   */
  async createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    const { databases, config } = getInstances();

    try {
      const doc = await databases.createDocument(
        config.databaseId,
        config.transactionsCollectionId,
        transaction.id || ID.unique(),
        transaction
      );

      return doc as BankTransaction;
    } catch (error: any) {
      console.error('Create transaction error:', error);
      throw new Error(error.message || 'Error al crear transacción');
    }
  },

  /**
   * Get all bank transactions
   */
  async getTransactions(): Promise<BankTransaction[]> {
    const { databases, config } = getInstances();

    try {
      const response = await databases.listDocuments(
        config.databaseId,
        config.transactionsCollectionId,
        [Query.orderDesc('date'), Query.limit(1000)]
      );

      return response.documents as BankTransaction[];
    } catch (error: any) {
      console.error('Get transactions error:', error);
      throw new Error(error.message || 'Error al obtener transacciones');
    }
  },

  /**
   * Update Bank Transaction
   */
  async updateTransaction(transaction: BankTransaction): Promise<BankTransaction> {
    const { databases, config } = getInstances();

    try {
      const doc = await databases.updateDocument(
        config.databaseId,
        config.transactionsCollectionId,
        transaction.id,
        transaction
      );

      return doc as BankTransaction;
    } catch (error: any) {
      console.error('Update transaction error:', error);
      throw new Error(error.message || 'Error al actualizar transacción');
    }
  },

  /**
   * Save App Settings
   */
  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const { databases, config } = getInstances();

    try {
      // Try to get existing settings document
      const response = await databases.listDocuments(
        config.databaseId,
        config.settingsCollectionId,
        [Query.limit(1)]
      );

      if (response.documents.length > 0) {
        // Update existing
        const doc = await databases.updateDocument(
          config.databaseId,
          config.settingsCollectionId,
          response.documents[0].$id,
          settings
        );
        return doc as AppSettings;
      } else {
        // Create new
        const doc = await databases.createDocument(
          config.databaseId,
          config.settingsCollectionId,
          ID.unique(),
          settings
        );
        return doc as AppSettings;
      }
    } catch (error: any) {
      console.error('Save settings error:', error);
      throw new Error(error.message || 'Error al guardar configuración');
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
        return response.documents[0] as AppSettings;
      }

      return null;
    } catch (error: any) {
      console.error('Get settings error:', error);
      return null;
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

      return file as Blob;
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
