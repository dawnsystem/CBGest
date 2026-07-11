/**
 * Default value factories for all major types in the application.
 * Use these functions to ensure consistent initialization and avoid undefined errors.
 */

import {
  PartnerTaxInfo,
  Partner,
  DataSourceConfig,
  AppSettings,
  Invoice,
  AccountingEntry,
  BankTransaction,
  Supplier,
  NifType,
} from '../types';

// ============================================================================
// PARTNER TAX INFO DEFAULTS
// ============================================================================

export const createDefaultPartnerTaxInfo = (): PartnerTaxInfo => ({
  // Personal data
  birthYear: 1980,
  disabilityLevel: 'NONE',

  // Income
  otherWorkIncome: 0,
  otherActivitiesIncome: 0,
  numberOfPayers: 1,
  secondPayerAmount: 0,

  // Family situation
  taxResidency: 'CATALUÑA',
  maritalStatus: 'SINGLE',
  jointDeclaration: false,

  // Children
  childrenUnder3: 0,
  childrenFrom3To25: 0,
  childrenWithDisability: 0,

  // Ascendants
  ascendantsOver65: 0,
  ascendantsOver75: 0,
  ascendantsWithDisability: 0,

  // Deductions
  deductibleExpenses: 0,
  pensionContributions: 0,
});

// ============================================================================
// PARTNER DEFAULTS
// ============================================================================

export const createDefaultPartner = (id?: string): Partner => ({
  id: id || generateId(),
  name: '',
  nif: '',
  participation: 0,
  taxInfo: undefined,
});

// ============================================================================
// DATA SOURCE CONFIG DEFAULTS
// ============================================================================

export const createDefaultDataSourceConfig = (): DataSourceConfig => ({
  type: 'APPWRITE',
  autoBackup: true,
});

// ============================================================================
// APP SETTINGS DEFAULTS
// ============================================================================

export const createDefaultAppSettings = (): AppSettings => ({
  cbName: '',
  nif: '',
  fiscalRegime: 'ALQUILER_EXENTO',
  vatObligation: false,
  partners: [],
  dataConfig: createDefaultDataSourceConfig(),
});

// ============================================================================
// INVOICE DEFAULTS
// ============================================================================

export const createDefaultInvoice = (id?: string): Invoice => ({
  id: id || generateId(),
  number: '',
  date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  issuerName: '',
  issuerNif: '',
  baseAmount: 0,
  vatRate: 21,
  vatAmount: 0,
  totalAmount: 0,
  type: 'EXPENSE',
  status: 'PENDING',
  history: [],
});

// ============================================================================
// ACCOUNTING ENTRY DEFAULTS
// ============================================================================

export const createDefaultAccountingEntry = (id?: string): AccountingEntry => ({
  id: id || generateId(),
  date: new Date().toISOString().split('T')[0],
  concept: '',
  // Multi-line entry system (required)
  lines: [],
  // Legacy fields for compatibility
  accountCode: '',
  accountName: '',
  debit: 0,
  credit: 0,
  reconciled: false,
});

// ============================================================================
// BANK TRANSACTION DEFAULTS
// ============================================================================

export const createDefaultBankTransaction = (id?: string): BankTransaction => ({
  id: id || generateId(),
  date: new Date().toISOString().split('T')[0],
  concept: '',
  amount: 0,
  status: 'PENDING',
});

// ============================================================================
// SUPPLIER DEFAULTS
// ============================================================================

export const createDefaultSupplier = (id?: string): Supplier => ({
  id: id || generateId(),
  name: '',
  nif: '',
  nifType: 'NIF' as NifType,
});

// ============================================================================
// HELPER: ID GENERATION
// ============================================================================

/**
 * Generate a unique ID for local use.
 * Format: timestamp + random suffix for uniqueness.
 */
export const generateId = (): string => {
  // DEBT-010: Use crypto.randomUUID() for collision-free IDs in all modern browsers
  // and Node 19+. Falls back to the timestamp+random approach for old environments.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${randomSuffix}`;
};

/**
 * Parse a date string safely, returning a valid Date or null.
 * Handles YYYY-MM-DD, DD/MM/YYYY, and ISO formats.
 *
 * BUG-005 fix: YYYY-MM-DD strings are parsed as **local** time to avoid the
 * UTC-midnight interpretation that shifts the date one day backward in UTC+N
 * time zones (e.g. Spain UTC+1/UTC+2).
 */
export const parseDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;

  // YYYY-MM-DD — parse as local midnight to avoid UTC date shift (BUG-005)
  const yyyymmdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const parsed = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try DD/MM/YYYY format (common in Spain)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const parsed = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback: full ISO-8601 datetime strings (include time zone info)
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
};

/**
 * Format a date as YYYY-MM-DD string (standard format used in the app).
 *
 * BUG-004 fix: use local date components instead of toISOString() which
 * returns the UTC date — at 23:00 Spanish time the UTC date is the next day.
 */
export const formatDateYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format a date as DD/MM/YYYY string (Spanish display format).
 */
export const formatDateDDMMYYYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Safely get a value with a default fallback.
 * Useful for optional fields that might be undefined.
 */
export const withDefault = <T>(value: T | undefined | null, defaultValue: T): T => {
  return value ?? defaultValue;
};
