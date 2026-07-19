/**
 * @fileoverview Hook consolidado para handlers de datos
 * @description Proporciona todos los handlers CRUD para las entidades de la aplicación.
 *              Usa optimistic updates con rollback en caso de error.
 */

import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import {
  Invoice, AccountingEntry, BankTransaction, Supplier,
  Apartment, RecurringExpense, Reservation, AppSettings, BankStatementImport
} from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { detectNifType } from '../utils/validators';
import { generateId } from '../utils/defaults';
import { buildEntryFromInvoice } from '../utils/invoiceUtils';
import { buildEntryFromUnmatchedTransaction, buildInvoiceSettlementEntry } from '../utils/reconciliationUtils';
import {
  collectExistingLineFingerprints,
  prepareBankImport,
  type BankImportMeta,
  type BankImportResult,
} from '../utils/bankStatementDedup';

// ============================================================================
// DEBT-006: Generic optimistic-CRUD factory
// Reduces the ~200 lines of identical create/update/delete boilerplate for
// simple entities into a single reusable helper.
// ============================================================================

interface EntityBase { id: string; appwriteId?: string }

interface OptimisticCrudOptions<T extends EntityBase> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  isAppwrite: boolean;
  label: string;  // human-readable name for error messages, e.g. 'proveedor'
  create: (item: T) => Promise<T>;
  update: (item: T) => Promise<T | void>;
  remove: (appwriteId: string) => Promise<void>;
  showError: (msg: string) => void;
}

function makeOptimisticCrud<T extends EntityBase>(opts: OptimisticCrudOptions<T>) {
  const { items, setItems, isAppwrite, label, create, update, remove, showError } = opts;

  const handleAdd = async (item: T): Promise<void> => {
    setItems(prev => [item, ...prev]);
    if (!isAppwrite) return;
    try {
      const saved = await create(item);
      setItems(prev => prev.map(i => i.id === item.id ? saved : i));
    } catch (error: unknown) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      showError(`Error al crear ${label}: ${msg}`);
    }
  };

  const handleUpdate = async (item: T): Promise<void> => {
    const old = items.find(i => i.id === item.id);
    setItems(prev => prev.map(i => i.id === item.id ? item : i));
    if (!isAppwrite) return;
    try {
      await update({ ...item, appwriteId: item.appwriteId || item.id });
    } catch (error: unknown) {
      if (old) setItems(prev => prev.map(i => i.id === item.id ? old : i));
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      showError(`Error al actualizar ${label}: ${msg}`);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (!isAppwrite || !item) return;
    try {
      await remove(item.appwriteId || item.id);
    } catch (error: unknown) {
      setItems(prev => [item, ...prev]);
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      showError(`Error al eliminar ${label}: ${msg}`);
    }
  };

  return { handleAdd, handleUpdate, handleDelete };
}

// ============================================================================

interface DataSetters {
  setInvoices: Dispatch<SetStateAction<Invoice[]>>;
  setEntries: Dispatch<SetStateAction<AccountingEntry[]>>;
  setTransactions: Dispatch<SetStateAction<BankTransaction[]>>;
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  setApartments: Dispatch<SetStateAction<Apartment[]>>;
  setRecurringExpenses: Dispatch<SetStateAction<RecurringExpense[]>>;
  setReservations: Dispatch<SetStateAction<Reservation[]>>;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
}

interface DataGetters {
  invoices: Invoice[];
  entries: AccountingEntry[];
  transactions: BankTransaction[];
  suppliers: Supplier[];
  apartments: Apartment[];
  recurringExpenses: RecurringExpense[];
  reservations: Reservation[];
  settings: AppSettings;
}

interface UseDataHandlersOptions {
  data: DataGetters;
  setters: DataSetters;
  showError: (message: string) => void;
  showSuccess?: (message: string) => void;
  isReadOnly?: boolean;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  activeFiscalYearId?: string;
}

export function useDataHandlers(options: UseDataHandlersOptions) {
  const { data, setters, showError, showSuccess, isReadOnly = false, showToast, activeFiscalYearId } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const MAX_IMPORT_ERRORS_DISPLAYED = 3;
  /**
   * Optional execution behavior for internal handler chaining.
   *
   * `throwOnError` is used in multi-step flows (like reconciliation) where callers
   * must detect failures and coordinate rollback across several optimistic updates.
   */
  interface HandlerExecutionOptions { throwOnError?: boolean }
  const withFiscalYearId = useCallback(<T extends { fiscalYearId?: string }>(item: T): T =>
    (item.fiscalYearId != null && item.fiscalYearId !== '') || !activeFiscalYearId
      ? item
      : { ...item, fiscalYearId: activeFiscalYearId },
  [activeFiscalYearId]);

  // ============ ENTRY HANDLERS ============
  const handleAddEntry = useCallback(async (entry: AccountingEntry, opts?: HandlerExecutionOptions) => {
    const throwOnError = opts?.throwOnError === true;
    const isAutoGenerated = entry.id.startsWith('AUTO-');
    if (isReadOnly && !isAutoGenerated) {
      const message = 'Ejercicio cerrado — no se pueden añadir asientos';
      showToast?.(message, 'error');
      if (throwOnError) throw new Error(message);
      return;
    }

    const entryWithAudit: AccountingEntry = {
      ...withFiscalYearId(entry),
      createdBy: entry.createdBy || user?.$id,
      createdByName: entry.createdByName || user?.name,
      createdAt: entry.createdAt || new Date().toISOString()
    };

    setters.setEntries(prev => [entryWithAudit, ...prev]);

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.createEntry(entryWithAudit);
        setters.setEntries(prev => prev.map(e => e.id === entryWithAudit.id ? saved : e));
      } catch (error: unknown) {
        setters.setEntries(prev => prev.filter(e => e.id !== entryWithAudit.id));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al crear asiento: ${errorMessage}`);
        if (throwOnError) throw error;
        return;
      }
    }

    if (user && !entry.id.startsWith('AUTO-')) {
      addNotification({
        type: 'ENTRY_CREATED',
        title: 'Nuevo asiento contable',
        message: `${entry.concept} - ${entry.debit > 0 ? entry.debit.toFixed(2) : entry.credit.toFixed(2)}€`,
        userId: user.$id,
        userName: user.name,
        relatedId: entry.id
      });
    }
  }, [isReadOnly, showToast, withFiscalYearId, user, data.settings, setters, showError, addNotification]);

  const handleUpdateEntry = useCallback(async (entry: AccountingEntry, opts?: HandlerExecutionOptions) => {
    const throwOnError = opts?.throwOnError === true;
    if (isReadOnly) {
      const message = 'Ejercicio cerrado — no se pueden editar asientos';
      showToast?.(message, 'error');
      if (throwOnError) throw new Error(message);
      return;
    }
    const oldEntry = data.entries.find(e => e.id === entry.id);
    setters.setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateEntry(entry);
      } catch (error: unknown) {
        if (oldEntry) setters.setEntries(prev => prev.map(e => e.id === entry.id ? oldEntry : e));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar asiento: ${errorMessage}`);
        if (throwOnError) throw error;
        return;
      }
    }
  }, [isReadOnly, showToast, data.entries, data.settings, setters, showError]);

  const handleDeleteEntry = useCallback(async (id: string) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden eliminar asientos', 'error');
      return;
    }
    const entry = data.entries.find(e => e.id === id);
    setters.setEntries(prev => prev.filter(e => e.id !== id));

    if (data.settings.dataConfig?.type === 'APPWRITE' && entry) {
      try {
        await appwriteService.deleteEntry(entry.appwriteId || entry.id);
      } catch (error: unknown) {
        setters.setEntries(prev => [entry, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar asiento: ${errorMessage}`);
      }
    }
  }, [isReadOnly, showToast, data.entries, data.settings, setters, showError]);

  // Helper to create entry from invoice
  // DEBT-002: delegate to the shared utility in utils/invoiceUtils.ts
  const createEntryFromInvoice = useCallback((inv: Invoice) => {
    const entry = buildEntryFromInvoice(inv, { userId: user?.$id, userName: user?.name });
    handleAddEntry(entry);
  }, [user, handleAddEntry]);

  // ============ SUPPLIER HANDLERS ============
  // DEBT-006: update/delete use the generic factory; add wraps it to inject audit fields.
  const _supplierCrud = useMemo(() => makeOptimisticCrud<Supplier>({
    items: data.suppliers,
    setItems: setters.setSuppliers,
    isAppwrite: data.settings.dataConfig?.type === 'APPWRITE',
    label: 'proveedor',
    create: appwriteService.createSupplier,
    update: appwriteService.updateSupplier,
    remove: appwriteService.deleteSupplier,
    showError,
  }), [data.suppliers, setters.setSuppliers, data.settings.dataConfig?.type, showError]);

  const handleAddSupplier = useCallback(async (supplier: Supplier) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden añadir proveedores', 'error');
      return;
    }
    const supplierWithAudit: Supplier = {
      ...withFiscalYearId(supplier),
      createdBy: supplier.createdBy || user?.$id,
      createdByName: supplier.createdByName || user?.name
    };
    await _supplierCrud.handleAdd(supplierWithAudit);
  }, [isReadOnly, showToast, withFiscalYearId, user, _supplierCrud]);

  const handleUpdateSupplier = useCallback(
    (supplier: Supplier) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden editar proveedores', 'error');
        return Promise.resolve();
      }
      return _supplierCrud.handleUpdate(supplier);
    },
    [isReadOnly, showToast, _supplierCrud]
  );
  const handleDeleteSupplier = useCallback(
    (id: string) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden eliminar proveedores', 'error');
        return Promise.resolve();
      }
      return _supplierCrud.handleDelete(id);
    },
    [isReadOnly, showToast, _supplierCrud]
  );

  // ============ INVOICE HANDLERS ============
  const handleAddInvoice = useCallback(async (invoice: Invoice) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden añadir facturas', 'error');
      return;
    }
    const originalStatus = invoice.status;
    const invoiceWithAudit: Invoice = {
      ...withFiscalYearId(invoice),
      createdBy: user?.$id,
      createdByName: user?.name,
      createdAt: new Date().toISOString()
    };

    setters.setInvoices(prev => [invoiceWithAudit, ...prev]);

    let persistedInvoice: Invoice = invoiceWithAudit;

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.createInvoice(invoiceWithAudit);
        persistedInvoice = { ...saved, status: saved.status || originalStatus };
        setters.setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? persistedInvoice : i));
      } catch (error: unknown) {
        setters.setInvoices(prev => prev.filter(i => i.id !== invoiceWithAudit.id));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar factura: ${errorMessage}`);
        return;
      }
    }

    if (user) {
      addNotification({
        type: 'INVOICE_CREATED',
        title: 'Nueva factura creada',
        message: `${persistedInvoice.type === 'INCOME' ? 'Ingreso' : 'Gasto'} de ${persistedInvoice.issuerName} por ${(persistedInvoice.totalAmount ?? 0).toFixed(2)}€`,
        userId: user.$id,
        userName: user.name,
        relatedId: persistedInvoice.id
      });
    }

    // Auto-create supplier if needed and persist supplierId (BUG-INV-001)
    if ((originalStatus === 'PROCESSED' || originalStatus === 'PAID') && persistedInvoice.issuerNif && persistedInvoice.issuerName) {
      const existingSupplier = data.suppliers.find(s =>
        s.nif.toUpperCase().replace(/\s/g, '') === persistedInvoice.issuerNif.toUpperCase().replace(/\s/g, '')
      );

      let linkedSupplierId: string | undefined;

      if (!existingSupplier) {
        const newSupplier: Supplier = {
          id: generateId(),
          name: persistedInvoice.issuerName,
          nif: persistedInvoice.issuerNif.toUpperCase(),
          nifType: detectNifType(persistedInvoice.issuerNif),
          address: persistedInvoice.issuerAddress,
          city: persistedInvoice.issuerCity,
          postalCode: persistedInvoice.issuerPostalCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user?.$id,
          createdByName: user?.name
        };
        handleAddSupplier(newSupplier);
        linkedSupplierId = newSupplier.id;
      } else if (!persistedInvoice.supplierId) {
        linkedSupplierId = existingSupplier.id;
      }

      if (linkedSupplierId) {
        const linkedInvoice: Invoice = { ...persistedInvoice, supplierId: linkedSupplierId };
        setters.setInvoices(prev => prev.map(i => i.id === persistedInvoice.id ? linkedInvoice : i));
        persistedInvoice = linkedInvoice;

        if (data.settings.dataConfig?.type === 'APPWRITE') {
          try {
            await appwriteService.updateInvoice(linkedInvoice);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            showError(`Error al enlazar proveedor en factura: ${errorMessage}`);
          }
        }
      }
    }

    // Auto-create accounting entry
    if (originalStatus === 'PROCESSED' || originalStatus === 'PAID') {
      createEntryFromInvoice(persistedInvoice);
    }
  }, [isReadOnly, showToast, withFiscalYearId, user, data.settings, data.suppliers, setters, showError, addNotification, handleAddSupplier, createEntryFromInvoice]);

  const handleUpdateInvoice = useCallback(async (invoice: Invoice) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden editar facturas', 'error');
      return;
    }
    const oldInvoice = data.invoices.find(i => i.id === invoice.id);
    setters.setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateInvoice(invoice);
      } catch (error: unknown) {
        if (oldInvoice) setters.setInvoices(prev => prev.map(i => i.id === invoice.id ? oldInvoice : i));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar factura: ${errorMessage}`);
        return;
      }
    }

    // Auto-create entry if status changed to PROCESSED/PAID
    if (oldInvoice?.status === 'PENDING' && (invoice.status === 'PROCESSED' || invoice.status === 'PAID')) {
      const existingEntry = data.entries.find(e => e.invoiceId === invoice.id);
      if (!existingEntry) {
        createEntryFromInvoice(invoice);
      }
    }
  }, [isReadOnly, showToast, data.invoices, data.entries, data.settings, setters, showError, createEntryFromInvoice]);

  const handleDeleteInvoice = useCallback(async (id: string) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden eliminar facturas', 'error');
      return;
    }
    const invoice = data.invoices.find(i => i.id === id);
    setters.setInvoices(prev => prev.filter(i => i.id !== id));

    if (data.settings.dataConfig?.type === 'APPWRITE' && invoice) {
      try {
        await appwriteService.deleteInvoice(invoice.appwriteId || invoice.id);
      } catch (error: unknown) {
        setters.setInvoices(prev => [invoice, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar factura: ${errorMessage}`);
        return;
      }
    }

    // Delete related entry
    const relatedEntry = data.entries.find(e => e.invoiceId === id);
    if (relatedEntry) {
      handleDeleteEntry(relatedEntry.id);
    }
  }, [isReadOnly, showToast, data.invoices, data.entries, data.settings, setters, showError, handleDeleteEntry]);

  // ============ BANK TRANSACTION HANDLERS ============
  /**
   * Imports bank movements with content/file deduplication.
   *
   * @param txs - Parsed movements (may already include ids)
   * @param meta - Optional file SHA / name from the upload queue
   * @returns Dedup summary for UI toasts
   */
  const handleAddBankTransactions = useCallback(async (
    txs: BankTransaction[],
    meta?: BankImportMeta
  ): Promise<BankImportResult<BankTransaction>> => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden añadir transacciones', 'error');
      return {
        toImport: [],
        skippedDuplicates: txs.length,
        isDuplicateStatement: true,
        contentFingerprint: '',
        message: 'Ejercicio cerrado — no se pueden añadir transacciones',
      };
    }

    const fiscalYearId = activeFiscalYearId;
    const importBatchId = generateId();

    const [existingLines, priorImports] = await Promise.all([
      collectExistingLineFingerprints(data.transactions),
      appwriteService.getBankStatementImports(fiscalYearId).catch(() => []),
    ]);

    const existingStatements = new Set(
      priorImports
        .map((row: BankStatementImport) => row.contentFingerprint)
        .filter(Boolean)
    );

    // Fast path: exact same file already imported
    if (meta?.fileSha256) {
      const byFile = await appwriteService.findImportByFileSha256(meta.fileSha256, fiscalYearId);
      if (byFile) {
        const result: BankImportResult<BankTransaction> = {
          toImport: [],
          skippedDuplicates: txs.length,
          isDuplicateStatement: true,
          contentFingerprint: byFile.contentFingerprint,
          message: 'Este extracto ya fue importado (mismo archivo).',
        };
        showToast?.(result.message, 'warning');
        return result;
      }
    }

    const prepared = await prepareBankImport(
      txs,
      existingLines,
      existingStatements,
      importBatchId
    );

    if (prepared.isDuplicateStatement || prepared.toImport.length === 0) {
      showToast?.(prepared.message, 'warning');
      return prepared as BankImportResult<BankTransaction>;
    }

    const txsWithAudit: BankTransaction[] = prepared.toImport.map((tx) => {
      const source = tx as BankTransaction & { contentFingerprint: string; importBatchId?: string };
      return {
        ...withFiscalYearId({
          ...source,
          id: source.id || generateId(),
          status: source.status || 'PENDING',
          contentFingerprint: source.contentFingerprint,
          importBatchId,
        }),
        createdBy: user?.$id,
        createdByName: user?.name,
        createdAt: new Date().toISOString(),
      };
    });

    setters.setTransactions((prev) => [...prev, ...txsWithAudit]);

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await Promise.all(
          txsWithAudit.map((tx) => appwriteService.createTransaction(tx))
        );
        setters.setTransactions((prev) =>
          prev.map((t) => {
            const s = saved.find((sv) => sv.id === t.id);
            return s || t;
          })
        );

        await appwriteService.createBankStatementImport({
          id: importBatchId,
          fileSha256: meta?.fileSha256,
          contentFingerprint: prepared.contentFingerprint,
          fiscalYearId,
          fileName: meta?.fileName,
          transactionCount: txsWithAudit.length,
          importedAt: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const ids = txsWithAudit.map((t) => t.id);
        setters.setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar transacciones: ${errorMessage}`);
        return {
          ...prepared,
          toImport: [],
          message: `Error al guardar transacciones: ${errorMessage}`,
        };
      }
    } else {
      // Local mode: still register fingerprint for subsequent dedup
      await appwriteService.createBankStatementImport({
        id: importBatchId,
        fileSha256: meta?.fileSha256,
        contentFingerprint: prepared.contentFingerprint,
        fiscalYearId,
        fileName: meta?.fileName,
        transactionCount: txsWithAudit.length,
        importedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }

    showToast?.(prepared.message, prepared.skippedDuplicates > 0 ? 'info' : 'success');
    showSuccess?.(prepared.message);
    return {
      ...prepared,
      toImport: txsWithAudit.map((tx) => ({
        ...tx,
        contentFingerprint: tx.contentFingerprint as string,
      })),
      importBatchId,
    };
  }, [
    isReadOnly,
    showToast,
    showSuccess,
    withFiscalYearId,
    user,
    data.settings,
    data.transactions,
    setters,
    showError,
    activeFiscalYearId,
  ]);

  const handleUpdateBankTransaction = useCallback(async (tx: BankTransaction, opts?: HandlerExecutionOptions) => {
    const throwOnError = opts?.throwOnError === true;
    if (isReadOnly) {
      const message = 'Ejercicio cerrado — no se pueden editar transacciones';
      showToast?.(message, 'error');
      if (throwOnError) throw new Error(message);
      return;
    }
    const oldTx = data.transactions.find(t => t.id === tx.id);
    setters.setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.databaseService.updateTransaction({ ...tx, appwriteId: tx.appwriteId || tx.id });
      } catch (error: unknown) {
        if (oldTx) setters.setTransactions(prev => prev.map(t => t.id === tx.id ? oldTx : t));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar transacción: ${errorMessage}`);
        if (throwOnError) throw error;
      }
    }
  }, [isReadOnly, showToast, data.transactions, data.settings, setters, showError]);

  // ============ APARTMENT HANDLERS ============
  // ============ APARTMENT HANDLERS — DEBT-006 factory ============
  const _aptCrud = useMemo(() => makeOptimisticCrud<Apartment>({
    items: data.apartments,
    setItems: setters.setApartments,
    isAppwrite: data.settings.dataConfig?.type === 'APPWRITE',
    label: 'apartamento',
    create: appwriteService.createApartment,
    update: appwriteService.updateApartment,
    remove: appwriteService.deleteApartment,
    showError,
  }), [data.apartments, setters.setApartments, data.settings.dataConfig?.type, showError]);
  const handleAddApartment = useCallback(
    (apt: Apartment) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden añadir apartamentos', 'error');
        return Promise.resolve();
      }
      return _aptCrud.handleAdd(withFiscalYearId(apt));
    }, [isReadOnly, showToast, withFiscalYearId, _aptCrud]
  );
  const handleUpdateApartment = useCallback(
    (apt: Apartment) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden editar apartamentos', 'error');
        return Promise.resolve();
      }
      return _aptCrud.handleUpdate(apt);
    }, [isReadOnly, showToast, _aptCrud]
  );
  const handleDeleteApartment = useCallback(
    (id: string) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden eliminar apartamentos', 'error');
        return Promise.resolve();
      }
      return _aptCrud.handleDelete(id);
    }, [isReadOnly, showToast, _aptCrud]
  );

  // ============ RECURRING EXPENSE HANDLERS — DEBT-006 factory ============
  const _expCrud = useMemo(() => makeOptimisticCrud<RecurringExpense>({
    items: data.recurringExpenses,
    setItems: setters.setRecurringExpenses,
    isAppwrite: data.settings.dataConfig?.type === 'APPWRITE',
    label: 'gasto recurrente',
    create: appwriteService.createRecurringExpense,
    update: appwriteService.updateRecurringExpense,
    remove: appwriteService.deleteRecurringExpense,
    showError,
  }), [data.recurringExpenses, setters.setRecurringExpenses, data.settings.dataConfig?.type, showError]);
  const handleAddRecurringExpense = useCallback(
    (exp: RecurringExpense) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden añadir gastos recurrentes', 'error');
        return Promise.resolve();
      }
      return _expCrud.handleAdd(withFiscalYearId(exp));
    }, [isReadOnly, showToast, withFiscalYearId, _expCrud]
  );
  const handleUpdateRecurringExpense = useCallback(
    (exp: RecurringExpense) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden editar gastos recurrentes', 'error');
        return Promise.resolve();
      }
      return _expCrud.handleUpdate(exp);
    }, [isReadOnly, showToast, _expCrud]
  );
  const handleDeleteRecurringExpense = useCallback(
    (id: string) => {
      if (isReadOnly) {
        showToast?.('Ejercicio cerrado — no se pueden eliminar gastos recurrentes', 'error');
        return Promise.resolve();
      }
      return _expCrud.handleDelete(id);
    }, [isReadOnly, showToast, _expCrud]
  );

  // ============ RESERVATION HANDLERS ============
  const handleAddReservations = useCallback(async (newReservations: Omit<Reservation, 'id'>[]) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden añadir reservas', 'error');
      return;
    }
    const existingByNumber = new Map<string, Reservation>();
    data.reservations.forEach(r => {
      if (r.reservationNumber) existingByNumber.set(r.reservationNumber, r);
    });

    const toCreate: Reservation[] = [];
    const toUpdate: Reservation[] = [];

    newReservations.forEach(newRes => {
      const existing = newRes.reservationNumber ? existingByNumber.get(newRes.reservationNumber) : null;
      if (existing) {
        toUpdate.push({
          ...existing,
          ...newRes,
          id: existing.id,
          appwriteId: existing.appwriteId
        });
      } else {
        toCreate.push(withFiscalYearId({
          ...newRes,
          id: generateId()
        }));
      }
    });

    const originalReservations = [...data.reservations];
    setters.setReservations(prev => {
      let updated = [...toCreate, ...prev];
      toUpdate.forEach(updatedRes => {
        updated = updated.map(r => r.id === updatedRes.id ? updatedRes : r);
      });
      return updated;
    });

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      let createdCount = 0;
      let updatedCount = 0;
      const errors: string[] = [];

      try {
        if (toCreate.length > 0) {
          const { created: savedReservations, failed: createFailures } = await appwriteService.createReservations(toCreate);
          createdCount = savedReservations.length;

          const failedIds = new Set(createFailures.map(f => f.id));
          // BUG-RES-001: quitar fantasmas no persistidos y enriquecer los guardados
          setters.setReservations(prev => prev
            .filter(r => !failedIds.has(r.id))
            .map(r => {
              const saved = savedReservations.find(s => s.id === r.id);
              return saved || r;
            }));

          for (const failure of createFailures) {
            const label = failure.reservationNumber || failure.id;
            errors.push(`Error creando ${label}: ${failure.error}`);
          }
        }

        for (const res of toUpdate) {
          try {
            await appwriteService.updateReservation(res);
            updatedCount++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error';
            errors.push(`Error actualizando ${res.reservationNumber}: ${msg}`);
          }
        }

        const parts: string[] = [];
        if (createdCount > 0) parts.push(`${createdCount} creadas`);
        if (updatedCount > 0) parts.push(`${updatedCount} actualizadas`);
        if (errors.length > 0) parts.push(`${errors.length} errores`);

        if (errors.length > 0) {
          showError(
            `Importación completada con ${errors.length} errores (mostrando ${Math.min(MAX_IMPORT_ERRORS_DISPLAYED, errors.length)}):\n${errors.slice(0, MAX_IMPORT_ERRORS_DISPLAYED).join('\n')}`
          );
        } else if (parts.length > 0) {
          showSuccess?.(`Importación completada: ${parts.join(', ')}`);
        }
      } catch (error: unknown) {
        setters.setReservations(originalReservations);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al importar reservas: ${errorMessage}. Los cambios no se han guardado.`);
      }
    } else {
      const parts: string[] = [];
      if (toCreate.length > 0) parts.push(`${toCreate.length} creadas`);
      if (toUpdate.length > 0) parts.push(`${toUpdate.length} actualizadas`);
      if (parts.length > 0) showSuccess?.(`Importación completada: ${parts.join(', ')}`);
    }
  }, [isReadOnly, showToast, data.reservations, withFiscalYearId, data.settings, setters, showError, showSuccess]);

  const handleUpdateReservation = useCallback(async (id: string, updates: Partial<Reservation>) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden editar reservas', 'error');
      return;
    }
    const old = data.reservations.find(r => r.id === id);
    if (!old) return;

    const updated = { ...old, ...updates };
    setters.setReservations(prev => prev.map(r => r.id === id ? updated : r));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateReservation(updated);
      } catch (error: unknown) {
        setters.setReservations(prev => prev.map(r => r.id === id ? old : r));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar reserva: ${errorMessage}`);
      }
    }
  }, [isReadOnly, showToast, data.reservations, data.settings, setters, showError]);

  const handleDeleteReservation = useCallback(async (id: string) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden eliminar reservas', 'error');
      return;
    }
    const res = data.reservations.find(r => r.id === id);
    setters.setReservations(prev => prev.filter(r => r.id !== id));

    if (data.settings.dataConfig?.type === 'APPWRITE' && res) {
      try {
        await appwriteService.deleteReservation(res.appwriteId || res.id);
      } catch (error: unknown) {
        setters.setReservations(prev => [res, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar reserva: ${errorMessage}`);
      }
    }
  }, [isReadOnly, showToast, data.reservations, data.settings, setters, showError]);

  const handleLinkApartmentToReservation = useCallback(async (reservationId: string, apartmentId: string) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden editar reservas', 'error');
      return;
    }
    const reservation = data.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const updatedReservation = { ...reservation, apartmentId };
    setters.setReservations(prev => prev.map(r => r.id === reservationId ? updatedReservation : r));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateReservation(updatedReservation);
      } catch (error: unknown) {
        setters.setReservations(prev => prev.map(r => r.id === reservationId ? reservation : r));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al vincular reserva: ${errorMessage}`);
      }
    }
  }, [isReadOnly, showToast, data.reservations, data.settings, setters, showError]);

  const handleCreateEntryFromTransaction = useCallback((tx: BankTransaction) => {
    const newEntry = buildEntryFromUnmatchedTransaction(tx, generateId());
    handleAddEntry(newEntry);
    handleUpdateBankTransaction({ ...tx, status: 'MATCHED', reconciledWithEntryId: newEntry.id });
    showToast?.("Asiento creado con partida doble. Ve a 'Libros Contables' para editar las cuentas si es necesario.", 'success');
  }, [handleAddEntry, handleUpdateBankTransaction, showToast]);

  const handleReconcileTransaction = useCallback(async (
    sourceId: string,
    matchedEntryId: string,
    sourceType: 'IMPORTED' | 'ACCOUNTING'
  ) => {
    const matchedEntry = data.entries.find(e => e.id === matchedEntryId);
    if (!matchedEntry) return;
    const previousMatchedEntry = { ...matchedEntry };

    if (sourceType === 'IMPORTED') {
      const transaction = data.transactions.find(t => t.id === sourceId);
      if (!transaction) return;

      if (matchedEntry.invoiceId) {
        const relatedInvoice = data.invoices.find(inv => inv.id === matchedEntry.invoiceId);
        const settlementEntryId = generateId();
        const settlementEntry = buildInvoiceSettlementEntry(transaction, matchedEntry, settlementEntryId, relatedInvoice);
        let settlementCreated = false;
        let entryUpdated = false;
        let rollbackFailed = false;

        try {
          await handleAddEntry(settlementEntry, { throwOnError: true });
          settlementCreated = true;
          await handleUpdateEntry({
            ...matchedEntry,
            reconciled: true,
            transactionId: matchedEntry.transactionId || transaction.id
          }, { throwOnError: true });
          entryUpdated = true;
          await handleUpdateBankTransaction({
            ...transaction,
            status: 'MATCHED',
            reconciledWithEntryId: settlementEntry.id,
            reconciledWithInvoiceId: matchedEntry.invoiceId
          }, { throwOnError: true });
        } catch (error: unknown) {
          if (settlementCreated) {
            setters.setEntries(prev => prev.filter(entry => entry.id !== settlementEntry.id));
            if (data.settings.dataConfig?.type === 'APPWRITE') {
              try {
                await appwriteService.databaseService.deleteEntry(settlementEntry.appwriteId || settlementEntry.id);
              } catch (rollbackError) {
                // El rollback en persistencia es best effort; el estado local ya se revierte.
                rollbackFailed = true;
                console.error('Error realizando rollback de asiento de liquidación:', rollbackError);
              }
            }
          }
          if (entryUpdated) {
            await handleUpdateEntry(previousMatchedEntry);
          }
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          const rollbackNotice = rollbackFailed ? ' Además, no se pudo completar el rollback en persistencia.' : '';
          console.error('Error creando asiento de liquidación en conciliación:', error);
          showError(`Error al crear asiento de liquidación de factura: ${errorMessage}.${rollbackNotice}`);
          return;
        }
        return;
      }

      await handleUpdateBankTransaction({ ...transaction, status: 'MATCHED', reconciledWithEntryId: matchedEntryId });
      await handleUpdateEntry({
        ...matchedEntry,
        reconciled: true,
        transactionId: matchedEntry.transactionId || transaction.id
      });
    } else {
      const bankEntry = data.entries.find(e => e.id === sourceId);
      if (!bankEntry) return;
      await handleUpdateEntry({ ...bankEntry, reconciled: true });
      await handleUpdateEntry({ ...matchedEntry, reconciled: true });
    }
  }, [data.entries, data.transactions, data.invoices, data.settings, setters, handleAddEntry, handleUpdateBankTransaction, handleUpdateEntry, showError]);

  // ============ SETTINGS HANDLER ============
  const handleUpdateSettings = useCallback(async (newSettings: AppSettings) => {
    setters.setSettings(newSettings);
    localStorage.setItem('gestcb_settings', JSON.stringify(newSettings));

    if (newSettings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.saveSettings(newSettings);
      } catch (error) {
        console.error('Error syncing settings:', error);
      }
    }
  }, [setters]);

  return {
    // Invoice handlers
    handleAddInvoice,
    handleUpdateInvoice,
    handleDeleteInvoice,
    // Entry handlers
    handleAddEntry,
    handleUpdateEntry,
    handleDeleteEntry,
    // Supplier handlers
    handleAddSupplier,
    handleUpdateSupplier,
    handleDeleteSupplier,
    // Transaction handlers
    handleAddBankTransactions,
    handleUpdateBankTransaction,
    // Apartment handlers
    handleAddApartment,
    handleUpdateApartment,
    handleDeleteApartment,
    // Recurring expense handlers
    handleAddRecurringExpense,
    handleUpdateRecurringExpense,
    handleDeleteRecurringExpense,
    // Reservation handlers
    handleAddReservations,
    handleUpdateReservation,
    handleDeleteReservation,
    handleLinkApartmentToReservation,
    handleReconcileTransaction,
    handleCreateEntryFromTransaction,
    // Settings handler
    handleUpdateSettings
  };
}
