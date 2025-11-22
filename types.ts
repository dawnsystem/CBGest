
export enum UserRole {
  ADMIN = "ADMINISTRADOR",
  COMUNERO = "COMUNERO",
  GESTOR = "GESTOR"
}

export interface AppwriteUser {
  $id: string;
  name: string;
  email: string;
  registration: string;
  status: boolean;
}

export interface InvoiceHistoryEvent {
  date: string;
  action: string;
  user: string;
}

export interface Invoice {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  issuerName: string;
  issuerNif: string;
  issuerAddress?: string; // Domicilio fiscal del emisor
  issuerCity?: string; // Ciudad del emisor
  issuerPostalCode?: string; // Código postal del emisor
  issuerCountry?: string; // País del emisor (si no es España)
  supplierId?: string; // Reference to Supplier (if matched)
  baseAmount: number;
  vatRate: number; // 4, 10, 21
  vatAmount: number;
  totalAmount: number;
  type: 'EXPENSE' | 'INCOME';
  status: 'PENDING' | 'PROCESSED' | 'PAID';
  category?: string;
  history: InvoiceHistoryEvent[];

  // File handling
  file?: File; // Runtime only (not serializable)
  fileData?: string; // Base64 for persistence (Local/File mode)
  fileType?: string; // MIME type

  // Cloud fields
  appwriteId?: string; // Document ID in Cloud
  appwriteFileId?: string; // Attachment ID in Storage
}

// Asiento Contable REAL y EDITABLE
export interface AccountingEntry {
  id: string;
  date: string;
  concept: string;
  accountCode: string; // Ej: 628.0.1
  accountName: string; // Ej: Suministros
  debit: number;
  credit: number;
  invoiceId?: string; // Enlace opcional a factura origen
  
  referenceDoc?: File; // Runtime only
  fileData?: string; // Base64 for persistence
  fileType?: string; // MIME type
  
  appwriteId?: string; // Document ID
  appwriteFileId?: string; // Attachment ID

  reconciled: boolean; // ¿Conciliado con banco?
}

export interface BankTransaction {
  id: string;
  date: string;
  valueDate?: string;
  concept: string;
  amount: number; // Positivo (Ingreso) o Negativo (Gasto)
  balance?: number;
  reconciledWithEntryId?: string; // ID del asiento con el que se casó
  status: 'PENDING' | 'MATCHED';
  
  appwriteId?: string;
}

// --- TAX INFO FOR PARTNERS ---
export interface PartnerTaxInfo {
  otherWorkIncome: number; // Rendimientos del trabajo (nómina externa)
  otherActivitiesIncome: number; // Otras actividades económicas
  taxResidency: 'CATALUÑA' | 'OTRA';
  maritalStatus: 'SINGLE' | 'MARRIED';
  childrenCount: number;
  disability: boolean;
  deductibleExpenses: number; // Gastos deducibles personales (SS, sindicatos)
}

export interface Partner {
  id: string;
  name: string;
  nif: string;
  participation: number; // Percentage 0-100
  taxInfo?: PartnerTaxInfo; // Optional tax details for simulation
}

// --- SUPPLIER/PROVIDER TYPES ---
export type NifType = 'NIF' | 'CIF' | 'NIE' | 'DNI' | 'PASAPORTE';

export interface Supplier {
  id: string;
  name: string;
  nif: string;
  nifType: NifType;
  address?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
  category?: string; // Business category
  notes?: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date

  // Cloud fields
  appwriteId?: string;
}

// Data Source Types
export type DataSourceType = 'LOCAL_STORAGE' | 'LOCAL_FILE' | 'APPWRITE' | 'SUPABASE' | 'FIREBASE';

export interface AppwriteConfig {
  endpoint: string;         // ej: https://cloud.appwrite.io/v1
  projectId: string;        // Project ID de Appwrite
  databaseId: string;       // Database ID
  // Collection IDs
  invoicesCollectionId: string;
  entriesCollectionId: string;
  transactionsCollectionId: string;
  settingsCollectionId: string;
  notificationsCollectionId: string;  // Colección de notificaciones
  uploadsCollectionId: string;         // Colección de cola de uploads
  suppliersCollectionId: string;       // Colección de proveedores
  // Storage Bucket ID
  storageBucketId: string;
  bucketId?: string;        // Alias for backward compatibility
}

export interface DataSourceConfig {
  type: DataSourceType;
  // Appwrite config
  appwrite?: AppwriteConfig;
  // Direct Appwrite properties for backward compatibility
  appwriteEndpoint?: string;
  appwriteProjectId?: string;
  appwriteDatabaseId?: string;
  appwriteBucketId?: string;
  // Configuración futura para conectores remotos
  supabaseUrl?: string;
  supabaseKey?: string;
  firebaseConfig?: string;
  autoBackup: boolean;
  // Local File info (Not persisted, runtime only)
  fileName?: string;
}

// User types for Auth
export interface AppUser {
  $id: string;
  email: string;
  name: string;
  emailVerification: boolean;
  prefs: Record<string, any>;
}

export interface AppSettings {
  appwriteId?: string; // ID del documento de settings en la nube
  cbName: string;
  nif: string;
  fiscalRegime: 'GENERAL' | 'ALQUILER_EXENTO'; // General (con IVA) vs Alquiler (Sin IVA)
  vatObligation: boolean;
  partners: Partner[];
  dataConfig?: DataSourceConfig; // New field for data management
}

export interface DashboardMetrics {
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
  pendingVat: number;
}

export interface TaxModelData {
  model: '303' | '184' | '111';
  period: string;
  year: number;
  status: 'DRAFT' | 'FILED';
  result: number;
}

// --- Upload Queue Types ---

export type UploadStatus = 'QUEUED' | 'ANALYZING' | 'COMPLETED' | 'ERROR';
export type UploadType = 'INVOICE' | 'BANK_STATEMENT'; // Nuevo selector

export interface QueueItem {
  id: string;
  file: File;
  uploadType: UploadType; // Factura o Banco

  // Persistence fields
  fileName: string;
  mimeType: string;
  base64Data?: string;

  status: UploadStatus;
  progress: number;

  // Resultados (Union type simple)
  result?: Invoice;
  bankResult?: BankTransaction[]; // Si es extracto bancario devuelve array

  error?: string;
  timestamp: number;

  // UI State
  notificationDismissed?: boolean;
  needsMapping?: boolean; // XLSX files need manual column mapping
}

export interface UploadQueueContextType {
  queue: QueueItem[];
  addToQueue: (files: File[], type: UploadType) => void;
  removeFromQueue: (id: string) => void;
  retryItem: (id: string) => void;
  clearCompleted: () => void;
  dismissNotifications: () => void;
}

// --- Notification Types ---

export type NotificationType =
  | 'INVOICE_CREATED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_DELETED'
  | 'ENTRY_CREATED'
  | 'ENTRY_UPDATED'
  | 'ENTRY_DELETED'
  | 'TRANSACTION_ADDED'
  | 'SETTINGS_UPDATED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  userId: string; // ID del usuario que realizó la acción
  userName: string; // Nombre del usuario que realizó la acción
  timestamp: number;
  read: boolean;
  relatedId?: string; // ID de la factura/asiento/transacción relacionada
  appwriteId?: string; // ID del documento en Appwrite
}

export interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}