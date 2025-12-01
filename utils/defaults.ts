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
  fiscalRegime: 'GENERAL',
  vatObligation: true,
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
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${randomSuffix}`;
};

/**
 * Parse a date string safely, returning a valid Date or null.
 * Handles YYYY-MM-DD, DD/MM/YYYY, and ISO formats.
 */
export const parseDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;

  // Try ISO format first (YYYY-MM-DD or full ISO)
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try DD/MM/YYYY format (common in Spain)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

/**
 * Format a date as YYYY-MM-DD string (standard format used in the app).
 */
export const formatDateYYYYMMDD = (date: Date): string => {
  return date.toISOString().split('T')[0];
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
