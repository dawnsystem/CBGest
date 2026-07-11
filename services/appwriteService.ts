/**
 * @fileoverview Servicios de Appwrite para CBGest — barrel de re-exports
 * @description Este archivo mantiene la API pública intacta para compatibilidad
 *   con todos los consumers existentes. La lógica real está en services/appwrite/*.
 *
 * ARCHITECTURE NOTE:
 * This file provides low-level Appwrite API operations with retry logic.
 * For application code, USE protectedDatabase from lib/appwrite/protectedDatabase.ts
 * which adds rate limiting and caching on top of these services.
 *
 * Layer hierarchy:
 * 1. lib/appwrite/client.ts - Appwrite SDK client instances
 * 2. services/appwriteService.ts - CRUD operations with retry (THIS FILE — barrel)
 * 3. services/appwrite/* - domain-specific implementations
 * 4. lib/appwrite/protectedDatabase.ts - Rate limiting, caching, debounce
 */

// ── Re-exports directos ───────────────────────────────────────────────────────

/**
 * @deprecated Import directly from './authService' instead.
 * This re-export exists for backwards compatibility only (DEBT-013).
 */
export { authService } from './authService';

export {
  buildMasterDataCopyDocumentId,
  getConnectionHealth,
  setConnectionHealth,
  setNotificationCallbacks,
  initializeAppwrite,
  isAppwriteInitialized,
  testConnection,
  verifyCollections,
  performHealthCheck,
} from './appwrite/infrastructure';

export { storageService } from './appwrite/storageService';
export { realtimeService, subscribeToChanges } from './appwrite/realtimeService';

// ── Imports de dominio ────────────────────────────────────────────────────────

import * as invoiceSvc from './appwrite/invoiceService';
import * as entrySvc from './appwrite/entryService';
import * as transactionSvc from './appwrite/transactionService';
import * as settingsSvc from './appwrite/settingsService';
import * as supplierSvc from './appwrite/supplierService';
import * as notifSvc from './appwrite/notificationService';
import * as uploadSvc from './appwrite/uploadQueueService';
import * as apartmentSvc from './appwrite/apartmentService';
import * as recurringExpenseSvc from './appwrite/recurringExpenseService';
import * as aiMatchSvc from './appwrite/aiMatchService';
import * as reservationSvc from './appwrite/reservationService';
import * as fiscalYearSvc from './appwrite/fiscalYearService';
import { storageService } from './appwrite/storageService';
import { initializeAppwrite, realtimeService } from './appwrite/infrastructure';
import { dataLogger } from './logger';
import type {
  Invoice,
  AccountingEntry,
  BankTransaction,
  AppSettings,
  Supplier,
  Apartment,
  RecurringExpense,
  AIMatchHistory,
  Reservation,
  FiscalYear,
} from '../types';

// ── databaseService — compatibilidad con consumers existentes ─────────────────

export const databaseService = {
  // INVOICES
  createInvoice: invoiceSvc.createInvoice,
  getInvoices: invoiceSvc.getInvoices,
  updateInvoice: invoiceSvc.updateInvoice,
  deleteInvoice: invoiceSvc.deleteInvoice,
  // ENTRIES
  createEntry: entrySvc.createEntry,
  getEntries: entrySvc.getEntries,
  updateEntry: entrySvc.updateEntry,
  deleteEntry: entrySvc.deleteEntry,
  // TRANSACTIONS
  createTransaction: transactionSvc.createTransaction,
  getTransactions: transactionSvc.getTransactions,
  updateTransaction: transactionSvc.updateTransaction,
  // SETTINGS
  saveSettings: settingsSvc.saveSettings,
  getSettings: settingsSvc.getSettings,
  // SUPPLIERS
  createSupplier: supplierSvc.createSupplier,
  getSuppliers: supplierSvc.getSuppliers,
  updateSupplier: supplierSvc.updateSupplier,
  deleteSupplier: supplierSvc.deleteSupplier,
  // NOTIFICATIONS
  createNotification: notifSvc.createNotification,
  getNotifications: notifSvc.getNotifications,
  updateNotification: notifSvc.updateNotification,
  deleteNotification: notifSvc.deleteNotification,
  deleteAllNotifications: notifSvc.deleteAllNotifications,
  // UPLOAD QUEUE
  createUploadItem: uploadSvc.createUploadItem,
  getUploadQueue: uploadSvc.getUploadQueue,
  updateUploadItem: uploadSvc.updateUploadItem,
  deleteUploadItem: uploadSvc.deleteUploadItem,
  deleteCompletedUploads: uploadSvc.deleteCompletedUploads,
  // APARTMENTS
  createApartment: apartmentSvc.createApartment,
  getApartments: apartmentSvc.getApartments,
  updateApartment: apartmentSvc.updateApartment,
  deleteApartment: apartmentSvc.deleteApartment,
  // RECURRING EXPENSES
  createRecurringExpense: recurringExpenseSvc.createRecurringExpense,
  getRecurringExpenses: recurringExpenseSvc.getRecurringExpenses,
  updateRecurringExpense: recurringExpenseSvc.updateRecurringExpense,
  deleteRecurringExpense: recurringExpenseSvc.deleteRecurringExpense,
  // AI MATCH HISTORY
  createAIMatchHistory: aiMatchSvc.createAIMatchHistory,
  getAIMatchHistory: aiMatchSvc.getAIMatchHistory,
  updateAIMatchHistory: aiMatchSvc.updateAIMatchHistory,
  deleteAIMatchHistory: aiMatchSvc.deleteAIMatchHistory,
  findMatchByBankConcept: aiMatchSvc.findMatchByBankConcept,
  // RESERVATIONS
  getReservations: reservationSvc.getReservations,
  createReservation: reservationSvc.createReservation,
  createReservations: reservationSvc.createReservations,
  updateReservation: reservationSvc.updateReservation,
  deleteReservation: reservationSvc.deleteReservation,
  // FISCAL YEARS
  createFiscalYear: fiscalYearSvc.createFiscalYear,
  getFiscalYears: fiscalYearSvc.getFiscalYears,
  updateFiscalYear: fiscalYearSvc.updateFiscalYear,
  migrateLegacyData: fiscalYearSvc.migrateLegacyData,
  copyMasterDataToFiscalYear: fiscalYearSvc.copyMasterDataToFiscalYear,
};

// ── Convenience functions — mantienen la API pública original ─────────────────

export const createInvoice = async (invoice: Invoice): Promise<Invoice> => {
  let appwriteFileId: string | undefined;
  if (invoice.file) {
    dataLogger.cloud('Uploading invoice file:', invoice.file.name);
    appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
  }
  const savedInvoice = await databaseService.createInvoice({ ...invoice, appwriteFileId });
  return { ...savedInvoice, file: invoice.file, appwriteFileId };
};

export const updateInvoice = async (invoice: Invoice): Promise<Invoice> => {
  let appwriteFileId = invoice.appwriteFileId;
  if (invoice.file && !invoice.appwriteFileId) {
    appwriteFileId = await storageService.uploadFile(invoice.file, `invoice-${invoice.id}`);
  }
  return await databaseService.updateInvoice({ ...invoice, appwriteFileId });
};

export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  const invoices = await databaseService.getInvoices();
  const invoice = invoices.find(inv => inv.id === invoiceId);
  if (invoice?.appwriteFileId) {
    try { await storageService.deleteFile(invoice.appwriteFileId); }
    catch (error) { console.warn('Could not delete file from storage:', error); }
  }
  await databaseService.deleteInvoice(invoiceId);
};

export const createEntry = (entry: AccountingEntry) => databaseService.createEntry(entry);
export const updateEntry = (entry: AccountingEntry) => databaseService.updateEntry(entry);
export const deleteEntry = (entryId: string) => databaseService.deleteEntry(entryId);
export const createTransaction = (transaction: BankTransaction) => databaseService.createTransaction(transaction);
export const saveSettings = (settings: AppSettings) => databaseService.saveSettings(settings);
export const getSettings = () => databaseService.getSettings();

export const syncSettings = async (localSettings: AppSettings): Promise<AppSettings | null> => {
  try {
    const remoteSettings = await databaseService.getSettings();
    if (!remoteSettings) {
      await databaseService.saveSettings(localSettings);
      return localSettings;
    }
    return { ...localSettings, ...remoteSettings, dataConfig: localSettings.dataConfig };
  } catch (error) {
    console.error('Error syncing settings:', error);
    return null;
  }
};

export const loadAllData = async () => {
  const [invoices, entries, transactions] = await Promise.all([
    databaseService.getInvoices(),
    databaseService.getEntries(),
    databaseService.getTransactions()
  ]);
  return { invoices, entries, transactions };
};

export const fetchInvoices = (fiscalYearId?: string) => databaseService.getInvoices(fiscalYearId);
export const fetchEntries = (fiscalYearId?: string) => databaseService.getEntries(fiscalYearId);
export const fetchTransactions = (fiscalYearId?: string) => databaseService.getTransactions(fiscalYearId);
export const fetchSuppliers = (fiscalYearId?: string) => databaseService.getSuppliers(fiscalYearId);

export const createSupplier = (supplier: Supplier) => databaseService.createSupplier(supplier);
export const updateSupplier = (supplier: Supplier) => databaseService.updateSupplier(supplier);
export const deleteSupplier = (id: string) => databaseService.deleteSupplier(id);

// --- APARTMENTS ---
export const fetchApartments = (fiscalYearId?: string) => databaseService.getApartments(fiscalYearId);
export const createApartment = (apartment: Apartment) => databaseService.createApartment(apartment);
export const updateApartment = (apartment: Apartment) => databaseService.updateApartment(apartment);
export const deleteApartment = (id: string) => databaseService.deleteApartment(id);

// --- RECURRING EXPENSES ---
export const fetchRecurringExpenses = () => databaseService.getRecurringExpenses();
export const createRecurringExpense = (expense: RecurringExpense) => databaseService.createRecurringExpense(expense);
export const updateRecurringExpense = (expense: RecurringExpense) => databaseService.updateRecurringExpense(expense);
export const deleteRecurringExpense = (id: string) => databaseService.deleteRecurringExpense(id);

// --- AI MATCH HISTORY ---
export const fetchAIMatchHistory = () => databaseService.getAIMatchHistory();
export const createAIMatchHistory = (match: AIMatchHistory) => databaseService.createAIMatchHistory(match);
export const updateAIMatchHistory = (match: AIMatchHistory) => databaseService.updateAIMatchHistory(match);
export const deleteAIMatchHistory = (id: string) => databaseService.deleteAIMatchHistory(id);
export const findMatchByBankConcept = (concept: string) => databaseService.findMatchByBankConcept(concept);

// --- RESERVATIONS ---
export const fetchReservations = (fiscalYearId?: string) => databaseService.getReservations(fiscalYearId);
export const createReservation = (reservation: Reservation) => databaseService.createReservation(reservation);
export const createReservations = (reservations: Reservation[]) => databaseService.createReservations(reservations);
export const updateReservation = (reservation: Reservation) => databaseService.updateReservation(reservation);
export const deleteReservation = (id: string) => databaseService.deleteReservation(id);

// --- FISCAL YEARS ---
export const fetchFiscalYears = () => databaseService.getFiscalYears();
export const createFiscalYearDoc = (fiscalYear: FiscalYear) => databaseService.createFiscalYear(fiscalYear);
export const updateFiscalYearDoc = (fiscalYear: FiscalYear) => databaseService.updateFiscalYear(fiscalYear);
export const migrateLegacyData = (fiscalYearId: string, onProgress?: (done: number, total: number) => void) =>
  databaseService.migrateLegacyData(fiscalYearId, onProgress);
export const copyMasterDataToFiscalYear = (
  sourceFiscalYearId: string,
  targetFiscalYearId: string,
  onProgress?: (phase: string, done: number, total: number) => void
) => databaseService.copyMasterDataToFiscalYear(sourceFiscalYearId, targetFiscalYearId, onProgress);

export default {
  initialize: initializeAppwrite,
  database: databaseService,
  storage: storageService,
  realtime: realtimeService
};
