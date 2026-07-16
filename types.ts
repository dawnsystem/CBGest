
export enum UserRole {
  ADMIN = "ADMINISTRADOR",
  COMUNERO = "COMUNERO",
  GESTOR = "GESTOR"
}

// --- FISCAL YEAR (EJERCICIO CONTABLE) ---
export type FiscalYearStatus = 'OPEN' | 'CLOSED';

export interface FiscalYear {
  id: string;
  year: number;           // Año natural: 2025, 2026, etc.
  status: FiscalYearStatus;
  openedAt?: string;      // ISO fecha de apertura
  closedAt?: string;      // ISO fecha de cierre
  notes?: string;         // Comentarios opcionales
  appwriteId?: string;    // Document ID en Appwrite
  /**
   * Períodos de vigencia de la tasa turística para este ejercicio.
   * Se almacena serializado como JSON string en Appwrite (igual que `partners` en AppSettings).
   * Si está ausente, el sistema usa AppSettings.touristTaxConfig como fallback.
   */
  touristTaxPeriods?: string;
}

/** Conteo de documentos asociados a un ejercicio, usados como requisito previo al borrado */
export interface FiscalYearDependencies {
  invoices: number;
  entries: number;
  transactions: number;
  reservations: number;
  suppliers: number;
  apartments: number;
  recurringExpenses: number;
  total: number;
}

// --- COMMON TYPES (used across multiple interfaces) ---
// NifType includes all Spanish tax ID types plus VAT for EU intra-community operations
export type NifType = 'NIF' | 'CIF' | 'NIE' | 'DNI' | 'PASAPORTE' | 'VAT' | 'PASSPORT' | 'OTHER';

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
  issuerNifType?: NifType; // Type of NIF (NIF, CIF, NIE, etc.) - consistent with Supplier
  issuerAddress?: string; // Domicilio fiscal del emisor
  issuerCity?: string; // Ciudad del emisor
  issuerPostalCode?: string; // Código postal del emisor
  issuerCountry?: string; // País del emisor (si no es España)
  supplierId?: string; // Reference to Supplier (if matched)
  apartmentId?: string; // Reference to Apartment (NEW - for per-property tracking)
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

  // Audit fields
  createdBy?: string; // User ID who created this
  createdByName?: string; // User name who created this
  createdAt?: string; // ISO timestamp

  // Ejercicio contable
  fiscalYearId?: string; // ID del ejercicio al que pertenece esta factura
}

export interface AccountingEntryLine {
  accountCode: string;    // Ej: 628, 472, 410
  accountName: string;    // Ej: Suministros, IVA soportado, Acreedores
  debit: number;          // Importe en el Debe (0 si es Haber)
  credit: number;         // Importe en el Haber (0 si es Debe)
}

// Asiento Contable REAL con PARTIDA DOBLE (múltiples líneas)
export interface AccountingEntry {
  id: string;
  number?: number;        // Número secuencial del asiento (opcional para migración)
  date: string;
  concept: string;
  
  // NUEVO: Sistema de líneas múltiples (partida doble)
  lines: AccountingEntryLine[];
  
  // LEGACY: Campos para compatibilidad con asientos antiguos (single-line)
  // Si 'lines' está vacío, usar estos campos legacy
  accountCode?: string;   // @deprecated - usar lines[0].accountCode
  accountName?: string;   // @deprecated - usar lines[0].accountName
  debit?: number;         // @deprecated - usar lines[0].debit
  credit?: number;        // @deprecated - usar lines[0].credit
  
  invoiceId?: string;     // Enlace opcional a factura origen
  transactionId?: string; // Enlace opcional a transacción bancaria
  supplierId?: string;    // Enlace al proveedor (copiado de la factura)
  apartmentId?: string;   // Enlace al apartamento (copiado de la factura)

  referenceDoc?: File;    // Runtime only
  fileData?: string;      // Base64 for persistence
  fileType?: string;      // MIME type

  appwriteId?: string;    // Document ID
  appwriteFileId?: string; // Attachment ID

  reconciled: boolean;    // ¿Conciliado con banco?
  isDraft?: boolean;      // Borrador: guardado sin validar cuadre

  // Audit fields
  createdBy?: string;     // User ID who created this
  createdByName?: string; // User name who created this
  createdAt?: string;     // ISO timestamp

  // Ejercicio contable
  fiscalYearId?: string;  // ID del ejercicio al que pertenece este asiento
}

export interface EntryTotals {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;    // true si totalDebit === totalCredit
}

// Helper function para obtener líneas de un asiento (compatibilidad legacy)
export const getEntryLines = (entry: AccountingEntry): AccountingEntryLine[] => {
  // Si tiene líneas, usarlas directamente
  if (entry.lines && entry.lines.length > 0) {
    return entry.lines;
  }
  
  // Fallback para asientos legacy (single-line)
  if (entry.accountCode) {
    return [{
      accountCode: entry.accountCode,
      accountName: entry.accountName || '',
      debit: entry.debit || 0,
      credit: entry.credit || 0
    }];
  }
  
  return [];
};

// Helper function para calcular totales de un asiento
export const calculateEntryTotals = (entry: AccountingEntry): EntryTotals => {
  const lines = getEntryLines(entry);
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  
  return {
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 // Tolerancia de 1 céntimo
  };
};

export interface BankTransaction {
  id: string;
  date: string;
  valueDate?: string;
  concept: string;
  amount: number; // Positivo (Ingreso) o Negativo (Gasto)
  balance?: number;
  reconciledWithEntryId?: string; // ID del asiento con el que se casó
  reconciledWithInvoiceId?: string; // ID de la factura con la que se casó (NEW)
  status: 'PENDING' | 'MATCHED';

  // Platform detection (NEW - for Airbnb, Booking, etc.)
  platformDetected?: string; // e.g., 'AIRBNB', 'BOOKING', 'VRBO'
  grossAmount?: number; // Importe bruto (para calcular comisión de plataforma)

  // AI matching (NEW)
  aiMatchSuggestion?: string; // JSON string of AIMatchSuggestion

  appwriteId?: string;

  // Audit fields
  createdBy?: string; // User ID who created this
  createdByName?: string; // User name who created this
  createdAt?: string; // ISO timestamp

  // Ejercicio contable
  fiscalYearId?: string; // ID del ejercicio al que pertenece esta transacción
}

// --- TAX INFO FOR PARTNERS ---
export type DisabilityLevel = 'NONE' | 'LEVEL_33_65' | 'LEVEL_65_PLUS' | 'LEVEL_65_MOBILITY';

export interface PartnerTaxInfo {
  // --- Datos Personales ---
  birthYear: number; // Año de nacimiento (para calcular >65, >75)
  disabilityLevel: DisabilityLevel; // Grado de discapacidad

  // --- Ingresos ---
  otherWorkIncome: number; // Rendimientos del trabajo (nómina externa)
  otherActivitiesIncome: number; // Otras actividades económicas
  numberOfPayers: number; // Número de pagadores (1, 2 o más) - afecta obligación declarar
  secondPayerAmount: number; // Importe del 2º pagador (si >1.500€, baja límite exención)

  // --- Situación Familiar ---
  taxResidency: 'CATALUÑA' | 'OTRA';
  maritalStatus: 'SINGLE' | 'MARRIED';
  jointDeclaration: boolean; // Declaración conjunta (solo si casado)

  // --- Hijos ---
  childrenUnder3: number; // Hijos menores de 3 años (mayor deducción)
  childrenFrom3To25: number; // Hijos de 3 a 25 años
  childrenWithDisability: number; // Hijos con discapacidad (cualquier edad)

  // --- Ascendientes ---
  ascendantsOver65: number; // Ascendientes >65 años a cargo (convivencia)
  ascendantsOver75: number; // Ascendientes >75 años a cargo
  ascendantsWithDisability: number; // Ascendientes con discapacidad

  // --- Deducciones y Reducciones ---
  deductibleExpenses: number; // Gastos deducibles personales (SS, sindicatos)
  pensionContributions: number; // Aportaciones planes de pensiones (máx 1.500€)
}

/**
 * Legacy tax info interface for backward compatibility during migrations.
 * Do NOT use in new code - use PartnerTaxInfo instead.
 * @deprecated Only for migration purposes
 */
export interface LegacyPartnerTaxInfo extends Partial<PartnerTaxInfo> {
  childrenCount?: number;
  disability?: boolean;
}

export interface Partner {
  id: string;
  name: string;
  nif: string;
  participation: number; // Percentage 0-100
  taxInfo?: PartnerTaxInfo; // Optional tax details for simulation
}

// --- SUPPLIER/PROVIDER TYPES ---
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
  // Timestamps - gestionados por Appwrite automáticamente ($createdAt, $updatedAt)
  // Opcionales porque no los enviamos al crear/actualizar
  createdAt?: string; // ISO date
  updatedAt?: string; // ISO date

  // Cloud fields
  appwriteId?: string;

  // Audit fields
  createdBy?: string; // User ID who created this
  createdByName?: string; // User name who created this

  // Ejercicio contable (se copia de un ejercicio al siguiente)
  fiscalYearId?: string; // ID del ejercicio al que pertenece este proveedor
}

// --- APARTMENT TYPES (NEW - for per-property tracking) ---
export type ApartmentType = 'TOURIST' | 'RESIDENTIAL';

export interface Apartment {
  id: string;
  name: string; // e.g., "Apartamento 1A", "Ático"
  code?: string; // Short code e.g., "APT-01", "1A"
  address?: string;
  cadastralRef?: string; // Referencia catastral
  surfaceArea?: number; // m²
  maxOccupancy?: number; // Capacidad máxima
  licenseNumber?: string; // Licencia turística (HUT)
  apartmentType: ApartmentType; // TOURIST = Vivienda uso turístico, RESIDENTIAL = Vivienda habitual
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;

  // Cloud fields
  appwriteId?: string;

  // Ejercicio contable (se copia de un ejercicio al siguiente)
  fiscalYearId?: string; // ID del ejercicio al que pertenece este apartamento
}

// --- RECURRING EXPENSE TYPES (NEW - for expense projections) ---
export type ExpenseFrequency = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface RecurringExpense {
  id: string;
  name: string; // e.g., "Electricidad", "Comunidad"
  description?: string;
  estimatedAmount: number;
  frequency: ExpenseFrequency;
  category?: string; // PGC code or custom category
  apartmentId?: string; // null/undefined = common expense for all apartments
  supplierId?: string; // Optional link to supplier
  dayOfMonth?: number; // Expected day of the month (1-31)
  startDate?: string; // When this recurring expense starts
  endDate?: string; // Optional end date
  isDeductible: boolean;
  isActive: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  /** ID del ejercicio al que pertenece este gasto recurrente */
  fiscalYearId?: string;

  // Cloud fields
  appwriteId?: string;
}

// --- AI MATCH HISTORY TYPES (NEW - for AI learning from user decisions) ---
export type AIMatchType = 'INVOICE' | 'SUPPLIER' | 'CATEGORY' | 'PLATFORM';

export interface AIMatchHistory {
  id: string;
  // Bank transaction info (patterns to learn from)
  bankConcept: string; // Original bank concept text
  normalizedConcept?: string; // Cleaned/normalized version
  amount: number;

  // What it was matched to
  matchType: AIMatchType;
  matchedInvoiceId?: string;
  matchedSupplierId?: string;
  matchedSupplierName?: string;
  matchedCategory?: string;
  matchedPlatform?: string; // Airbnb, Booking, etc.

  // Confidence and feedback
  wasAiSuggestion: boolean; // Was this suggested by AI?
  userConfirmed: boolean; // Did user confirm this match?
  usageCount: number; // How many times this pattern has been used

  // Metadata
  createdAt?: string;
  lastUsedAt?: string;

  // Cloud fields
  appwriteId?: string;
}

// --- AI MATCH SUGGESTION (for real-time suggestions) ---
export interface AIMatchSuggestion {
  invoiceId?: string;
  invoiceName?: string;
  supplierId?: string;
  supplierName?: string;
  category?: string;
  platform?: string;
  confidence: number; // 0-100
  reason: string; // Why this match was suggested
}

// --- RESERVATION TYPES (for income tracking per apartment) ---
export type ReservationChannel = 'Booking' | 'Airbnb' | 'Direct' | 'Agoda' | 'Vrbo' | 'Other';
export type ReservationStatus = 'New' | 'Confirmed' | 'Paid' | 'PaidCC' | 'Cancelled' | 'Completed';

export interface Reservation {
  id: string;

  // Core booking data
  apartmentId?: string;        // Linked apartment ID
  apartmentName: string;       // Original name from import (for matching)
  checkIn: string;             // ISO date string
  checkOut: string;            // ISO date string
  nights: number;

  // Financial data
  pricePerNight: number;
  totalAmount: number;
  paidAmount: number;          // Amount already paid

  // Booking reference
  channel: ReservationChannel;
  reservationNumber: string;   // External booking reference
  status: ReservationStatus;

  // Guest info
  guestInitials?: string;      // Just initials like "J.S." (for GDPR)
  guestName?: string;          // Full name (for consecutive stay detection)
  guestEmail?: string;         // Email (for consecutive stay detection)
  numberOfGuests: number;      // Number of adult guests (≥17 years) for tourist tax
  numberOfChildren: number;    // Number of children (<17 years) - no tourist tax

  // Tourist Tax (IEET - Impost sobre Estades en Establiments Turístics)
  touristTaxAmount: number;           // Calculated tax amount
  touristTaxCollected: boolean;       // Has tax been collected from guest?
  touristTaxCollectedDate?: string;   // Date when tax was collected
  touristTaxNightsCounted: number;    // Nights counted for this reservation (max 7 per stay)

  // Deposit/Fianza
  depositAmount: number;              // Deposit amount (100€ for tourist, 1 month for residential)
  depositCollected: boolean;          // Has deposit been collected?
  depositCollectedDate?: string;      // Date when deposit was collected
  depositReturned: boolean;           // Has deposit been returned?
  depositReturnedDate?: string;       // Date when deposit was returned
  depositRetainedAmount: number;      // Amount retained for damages (if any)

  // Metadata
  importedAt?: string;
  notes?: string;

  // Cloud fields
  appwriteId?: string;

  // Ejercicio contable
  fiscalYearId?: string; // ID del ejercicio al que pertenece esta reserva
}

/**
 * Resultado de creación en lote de reservas (BUG-RES-001: no tragar fallos silenciosos).
 */
export interface CreateReservationsResult {
  created: Reservation[];
  failed: Array<{ id: string; reservationNumber?: string; error: string }>;
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
  /** Labels de Appwrite usados para roles (ej: "admin", "gestor", "comunero"). */
  labels?: string[];
  prefs: Record<string, unknown>;
}

/**
 * Usuario administrado, tal como lo devuelve la función `manage-users`.
 * No es una cuenta Appwrite completa: es la vista reducida que un admin
 * necesita para gestionar altas, bajas y restablecimientos de contraseña.
 */
export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  labels: string[];
  status: boolean;
  registration: string;
  passwordUpdate: string;
  /** true si el usuario debe cambiar su contraseña temporal en el próximo login. */
  mustChangePassword: boolean;
}

// --- TOURIST TAX CONFIGURATION (IEET - Cataluña) ---

/**
 * Período de vigencia de la tasa turística dentro de un ejercicio.
 * Permite reflejar cambios normativos (p.ej. un decreto que modifica la tarifa
 * a mitad de año) sin alterar períodos ya liquidados.
 */
export interface TouristTaxPeriod {
  id: string;
  startDate: string;        // ISO YYYY-MM-DD — fecha de inicio de vigencia
  endDate?: string;         // ISO YYYY-MM-DD — si no hay fecha fin, rige hasta el fin del ejercicio
  rate: number;             // €/noche/adulto
  maxNights: number;        // Máximo de noches tasables por estancia (p.ej. 7)
  minAge: number;           // Edad mínima para pagar tasa (p.ej. 17)
  enabled: boolean;         // Si la tasa está activa en este período
  notes?: string;           // Motivo del cambio (ej: "Decreto X/2025 de la Generalitat")
}

/**
 * @deprecated Usar TouristTaxPeriod directamente.
 * Mantenido por retrocompatibilidad con AppSettings.touristTaxConfig.
 */
export interface TouristTaxConfig {
  rate: number;            // €/night/adult (default: 1)
  maxNights: number;       // Maximum nights per stay (default: 7)
  minAge: number;          // Minimum age for tax (default: 17)
  enabled: boolean;        // Is tourist tax collection enabled?
}

export interface AppSettings {
  appwriteId?: string; // ID del documento de settings en la nube
  cbName: string;
  nif: string;
  fiscalRegime: 'GENERAL' | 'ALQUILER_EXENTO'; // General (con IVA) vs Alquiler (Sin IVA)
  vatObligation: boolean;
  partners: Partner[];
  dataConfig?: DataSourceConfig; // New field for data management
  
  // Tourist Tax Configuration (IEET - Cataluña)
  touristTaxConfig?: TouristTaxConfig;
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

/**
 * Upload status flow:
 * PENDING_UPLOAD → UPLOADING → QUEUED → ANALYZING → COMPLETED
 *                     ↓           ↓          ↓
 *                   ERROR       ERROR      ERROR
 * 
 * - PENDING_UPLOAD: Solo existe localmente, esperando subir a Storage
 * - UPLOADING: Subiendo archivo a Appwrite Storage
 * - QUEUED: En Appwrite (Storage + documento), esperando procesamiento Gemini
 * - ANALYZING: Procesando con Gemini AI
 * - COMPLETED: Análisis completado, listo para confirmar
 * - ERROR: Error en cualquier fase
 */
export type UploadStatus = 
  | 'PENDING_UPLOAD'  // Solo local, esperando subir
  | 'UPLOADING'       // Subiendo a Storage
  | 'QUEUED'          // En Appwrite, esperando Gemini
  | 'ANALYZING'       // Procesando con Gemini
  | 'COMPLETED'       // Listo
  | 'ERROR';          // Error

export type UploadType = 'INVOICE' | 'BANK_STATEMENT';

export interface QueueItem {
  id: string;
  
  // Appwrite IDs (undefined si solo existe localmente)
  appwriteId?: string;      // ID del documento en colección 'uploads'
  storageFileId?: string;   // ID del archivo en Storage bucket
  
  // File metadata
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadType: UploadType;
  
  // Local file reference (solo en memoria, no se persiste)
  // undefined cuando se carga desde Appwrite
  localFile?: File;
  
  // Status
  status: UploadStatus;
  progress: number;
  
  // Results (cuando COMPLETED)
  result?: Invoice;
  bankResult?: BankTransaction[];
  
  // Error info
  error?: string;
  
  // Timestamps
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
  /** Indica si hay subidas en progreso */
  isUploading: boolean;
  /** Número de items pendientes de subir */
  pendingCount: number;
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