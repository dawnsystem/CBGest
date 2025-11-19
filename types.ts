export enum UserRole {
  ADMIN = "ADMINISTRADOR",
  COMUNERO = "COMUNERO",
  GESTOR = "GESTOR"
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
  file?: File; // Original attached document
}

export interface AsientoContable {
  id: string;
  date: string;
  concept: string;
  debit: number;
  credit: number;
  accountCode: string;
  invoiceId?: string;
}

export interface Partner {
  id: string;
  name: string;
  nif: string;
  participation: number; // Percentage 0-100
}

export interface AppSettings {
  cbName: string;
  nif: string;
  fiscalRegime: 'GENERAL' | 'ALQUILER_EXENTO'; // General (con IVA) vs Alquiler (Sin IVA)
  vatObligation: boolean;
  partners: Partner[];
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

export interface QueueItem {
  id: string;
  file: File;
  // Persistence fields
  fileName: string;
  mimeType: string;
  base64Data?: string; // Required for localStorage persistence
  
  status: UploadStatus;
  progress: number;
  result?: Invoice;
  error?: string;
  timestamp: number;
  
  // UI State
  notificationDismissed?: boolean; // If true, hidden from global widget but kept in inbox
}

export interface UploadQueueContextType {
  queue: QueueItem[];
  addToQueue: (files: File[]) => void;
  removeFromQueue: (id: string) => void;
  retryItem: (id: string) => void;
  clearCompleted: () => void; // Deprecated behavior, creates confusion
  dismissNotifications: () => void; // New: Hides from widget only
}