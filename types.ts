
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

// Data Source Types
export type DataSourceType = 'LOCAL_STORAGE' | 'LOCAL_FILE' | 'APPWRITE';

export interface DataSourceConfig {
  type: DataSourceType;
  // Configuración Appwrite Cloud
  appwriteProjectId?: string;
  appwriteBucketId?: string;
  appwriteDatabaseId?: string; // NEW: Database ID
  appwriteEndpoint?: string; // NEW: Endpoint
  
  autoBackup: boolean;
  // Local File info (Not persisted, runtime only)
  fileName?: string;
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
}

export interface UploadQueueContextType {
  queue: QueueItem[];
  addToQueue: (files: File[], type: UploadType) => void;
  removeFromQueue: (id: string) => void;
  retryItem: (id: string) => void;
  clearCompleted: () => void; 
  dismissNotifications: () => void; 
}