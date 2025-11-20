
import { Client, Storage, Databases, Account, Functions, ID, Query } from 'appwrite';
import { AppSettings, Invoice, AccountingEntry, BankTransaction } from '../types';

// --- CONSTANTS ---
const COL_SETTINGS = 'settings';
const COL_INVOICES = 'invoices';
const COL_ENTRIES = 'entries';
const COL_TRANSACTIONS = 'transactions';

// --- SINGLETONS ---
let client: Client | null = null;
let account: Account | null = null;
let storage: Storage | null = null;
let databases: Databases | null = null;
let functions: Functions | null = null;

let projectId: string = '';
let bucketId: string = '';
let databaseId: string = '';
let currentEndpoint: string = '';

// --- INITIALIZATION ---
export const initAppwrite = (projId: string, bktId: string, dbId: string, endpoint: string = 'https://cloud.appwrite.io/v1') => {
  // Validate Endpoint
  let validEndpoint = endpoint;
  if (!validEndpoint || !validEndpoint.startsWith('http')) {
      validEndpoint = 'https://cloud.appwrite.io/v1';
  }
  try {
    new URL(validEndpoint);
  } catch (e) {
    validEndpoint = 'https://cloud.appwrite.io/v1';
  }

  projectId = projId;
  bucketId = bktId;
  databaseId = dbId;
  currentEndpoint = validEndpoint;
  
  // SINGLETON PATTERN:
  // If client exists, MUTATE it instead of creating new one.
  // This preserves the session cookies/localStorage handled by the SDK.
  if (client) {
      client.setEndpoint(validEndpoint).setProject(projectId);
  } else {
      client = new Client()
        .setEndpoint(validEndpoint)
        .setProject(projectId);
      
      // Initialize services only once
      account = new Account(client);
      storage = new Storage(client);
      databases = new Databases(client);
      functions = new Functions(client);
  }
};

export const getClient = () => client;

// Ping for setup verification
export const ping = async () => {
    if (!account) throw new Error("Appwrite not initialized");
    try {
        await account.get();
        return true;
    } catch (e: any) {
        // 401 is "Unauthorized" but means connection works (server replied)
        if (e.code === 401) return true;
        if (e.message === "Failed to fetch") throw new Error("CORS_ERROR");
        console.error("Ping failed details:", e);
        throw e;
    }
};

// ==========================================
// 1. AUTHENTICATION (Auth)
// ==========================================

export const login = async (email: string, pass: string) => {
    if (!account) throw new Error("Appwrite not initialized");
    
    // STRATEGY: Check First
    // 1. Check if session exists
    try {
        const existingUser = await account.get();
        return existingUser; // Session valid, return immediately
    } catch (e: any) {
        if (e.code === 429) throw new Error("RATELIMIT");
        // 401 means no session, proceed.
    }

    // 2. Try to create session directly. 
    // If "Session Active" error occurs, it means we have a zombie session state 
    // or a race condition. We handle that in catch block.
    try {
        return await account.createEmailPasswordSession(email, pass);
    } catch (e: any) {
        if (e.code === 429) throw new Error("RATELIMIT");
        
        // Fallback for "Session Active" (409 or specific type)
        if (e.code === 409 || e.type === 'general_session_already_exists') {
            // Try one last time to get the user, maybe the session IS valid now
            try {
                return await account.get();
            } catch (inner: any) { 
                if (inner.code === 429) throw new Error("RATELIMIT");
                // If we still can't get user, try nuclear option: delete session and retry create
                try {
                     await account.deleteSession('current');
                     return await account.createEmailPasswordSession(email, pass);
                } catch (nuclear: any) {
                     if (nuclear.code === 429) throw new Error("RATELIMIT");
                     throw e; // Give up
                }
            }
        }
        throw e;
    }
};

export const register = async (email: string, pass: string, name: string) => {
    if (!account) throw new Error("Appwrite not initialized");
    
    try {
        await account.create(ID.unique(), email, pass, name);
        return await login(email, pass);
    } catch (e: any) {
        if (e.code === 429) throw new Error("RATELIMIT");
        throw e;
    }
};

export const logout = async () => {
    if (!account) return;
    try {
        await account.deleteSession('current');
    } catch (e) { console.error("Logout error:", e); }
};

export const getCurrentUser = async () => {
    if (!account) return null;
    try {
        return await account.get();
    } catch (e) { return null; }
};


// ==========================================
// 2. DATABASES (DB)
// ==========================================

export const testConnection = async (): Promise<boolean> => {
  if (!databases || !databaseId) return false;
  try {
    await databases.listDocuments(databaseId, COL_SETTINGS, [Query.limit(1)]);
    return true;
  } catch (error) {
    console.error("Appwrite connection failed:", error);
    return false;
  }
};

const pack = (obj: any) => ({ data: JSON.stringify(obj) });
const unpack = (doc: any) => {
    try {
        const obj = JSON.parse(doc.data);
        return { ...obj, appwriteId: doc.$id };
    } catch (e) {
        return null;
    }
};

// --- Settings ---
export const syncSettings = async (currentSettings: AppSettings): Promise<AppSettings | null> => {
    if (!databases || !databaseId) return null;
    try {
        const list = await databases.listDocuments(databaseId, COL_SETTINGS, [Query.limit(1)]);
        if (list.documents.length > 0) {
            const remote = unpack(list.documents[0]);
            if (!remote) return null;
            
            // SANITIZE: Ensure arrays exist
            return { 
                ...remote, 
                partners: Array.isArray(remote.partners) ? remote.partners : [],
                dataConfig: currentSettings.dataConfig 
            };
        } else {
            // Init remote settings
            const cleanSettings = { ...currentSettings };
            delete cleanSettings.dataConfig;
            const doc = await databases.createDocument(databaseId, COL_SETTINGS, ID.unique(), pack(cleanSettings));
            return { ...currentSettings, appwriteId: doc.$id };
        }
    } catch (e) {
        console.error("Sync Settings error", e);
        return null;
    }
};

export const updateSettings = async (settings: AppSettings) => {
    if (!databases || !databaseId || !settings.appwriteId) return;
    const cleanSettings = { ...settings };
    delete cleanSettings.dataConfig;
    try {
        await databases.updateDocument(databaseId, COL_SETTINGS, settings.appwriteId, pack(cleanSettings));
    } catch (e) { console.error("Update settings error", e); }
};

// --- Invoices ---
export const fetchInvoices = async (): Promise<Invoice[]> => {
    // GUARD CLAUSE
    if (!databases || !databaseId) return [];
    
    try {
        const list = await databases.listDocuments(databaseId, COL_INVOICES, [Query.limit(100), Query.orderDesc('$createdAt')]);
        return list.documents.map(unpack).filter(Boolean);
    } catch (e) {
        console.error("Error fetching invoices:", e);
        return [];
    }
};

export const createInvoice = async (invoice: Invoice): Promise<Invoice> => {
    if (!databases || !databaseId) throw new Error("No DB connection");
    const doc = await databases.createDocument(databaseId, COL_INVOICES, ID.unique(), pack(invoice));
    return { ...invoice, appwriteId: doc.$id };
};

export const updateInvoice = async (invoice: Invoice) => {
    if (!databases || !databaseId || !invoice.appwriteId) return;
    await databases.updateDocument(databaseId, COL_INVOICES, invoice.appwriteId, pack(invoice));
};

export const deleteInvoice = async (id: string) => {
    if (!databases || !databaseId) return;
    await databases.deleteDocument(databaseId, COL_INVOICES, id);
};

// --- Entries ---
export const fetchEntries = async (): Promise<AccountingEntry[]> => {
    if (!databases || !databaseId) return [];
    try {
        const list = await databases.listDocuments(databaseId, COL_ENTRIES, [Query.limit(100), Query.orderDesc('$createdAt')]);
        return list.documents.map(unpack).filter(Boolean);
    } catch (e) { return []; }
};

export const createEntry = async (entry: AccountingEntry): Promise<AccountingEntry> => {
    if (!databases || !databaseId) throw new Error("No DB connection");
    const doc = await databases.createDocument(databaseId, COL_ENTRIES, ID.unique(), pack(entry));
    return { ...entry, appwriteId: doc.$id };
};

export const updateEntry = async (entry: AccountingEntry) => {
    if (!databases || !databaseId || !entry.appwriteId) return;
    await databases.updateDocument(databaseId, COL_ENTRIES, entry.appwriteId, pack(entry));
};

export const deleteEntry = async (id: string) => {
    if (!databases || !databaseId) return;
    await databases.deleteDocument(databaseId, COL_ENTRIES, id);
};

// --- Transactions ---
export const fetchTransactions = async (): Promise<BankTransaction[]> => {
    if (!databases || !databaseId) return [];
    try {
        const list = await databases.listDocuments(databaseId, COL_TRANSACTIONS, [Query.limit(100), Query.orderDesc('$createdAt')]);
        return list.documents.map(unpack).filter(Boolean);
    } catch (e) { return []; }
};

export const createTransaction = async (tx: BankTransaction): Promise<BankTransaction> => {
    if (!databases || !databaseId) throw new Error("No DB connection");
    const doc = await databases.createDocument(databaseId, COL_TRANSACTIONS, ID.unique(), pack(tx));
    return { ...tx, appwriteId: doc.$id };
};

export const updateTransaction = async (tx: BankTransaction) => {
    if (!databases || !databaseId || !tx.appwriteId) return;
    await databases.updateDocument(databaseId, COL_TRANSACTIONS, tx.appwriteId, pack(tx));
};


// ==========================================
// 3. STORAGE (Files)
// ==========================================

export const uploadFile = async (file: File): Promise<string> => {
    if (!storage || !bucketId) throw new Error("No Storage");
    const result = await storage.createFile(bucketId, ID.unique(), file);
    return result.$id;
};

export const getFileViewUrl = (fileId: string): string => {
    if (!storage || !bucketId) return '';
    return storage.getFileView(bucketId, fileId).href;
};


// ==========================================
// 4. FUNCTIONS & REALTIME
// ==========================================

export const executeFunction = async (functionId: string, data?: string) => {
    if (!functions) throw new Error("Functions not initialized");
    return await functions.createExecution(functionId, data);
};

export const subscribeToChanges = (callback: (payload: any) => void) => {
    if (!client || !databaseId) return () => {};
    try {
        const channel = `databases.${databaseId}.collections.*.documents`;
        return client.subscribe(channel, callback);
    } catch (e) { return () => {}; }
};
