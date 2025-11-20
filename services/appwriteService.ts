import { Client, Account, Databases, Storage, Query, ID, Models } from 'appwrite';
import { AppwriteConfig, Invoice, AccountingEntry, BankTransaction, AppSettings, AppUser } from '../types';

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

export default {
  initialize: initializeAppwrite,
  auth: authService,
  database: databaseService,
  storage: storageService,
  realtime: realtimeService
};
