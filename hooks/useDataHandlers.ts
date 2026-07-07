/**
 * @fileoverview Hook consolidado para handlers de datos
 * @description Proporciona todos los handlers CRUD para las entidades de la aplicación.
 *              Usa optimistic updates con rollback en caso de error.
 */

import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import {
  Invoice, AccountingEntry, BankTransaction, Supplier,
  Apartment, RecurringExpense, Reservation, AppSettings
} from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { detectNifType } from '../utils/validators';
import { generateId } from '../utils/defaults';
import { buildEntryFromInvoice } from '../utils/invoiceUtils';

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
}

export function useDataHandlers(options: UseDataHandlersOptions) {
  const { data, setters, showError } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // ============ ENTRY HANDLERS ============
  const handleAddEntry = useCallback(async (entry: AccountingEntry) => {
    const entryWithAudit: AccountingEntry = {
      ...entry,
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
  }, [user, data.settings, setters, showError, addNotification]);

  const handleUpdateEntry = useCallback(async (entry: AccountingEntry) => {
    const oldEntry = data.entries.find(e => e.id === entry.id);
    setters.setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateEntry(entry);
      } catch (error: unknown) {
        if (oldEntry) setters.setEntries(prev => prev.map(e => e.id === entry.id ? oldEntry : e));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar asiento: ${errorMessage}`);
        return;
      }
    }
  }, [data.entries, data.settings, setters, showError]);

  const handleDeleteEntry = useCallback(async (id: string) => {
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
  }, [data.entries, data.settings, setters, showError]);

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
    const supplierWithAudit: Supplier = {
      ...supplier,
      createdBy: supplier.createdBy || user?.$id,
      createdByName: supplier.createdByName || user?.name
    };
    await _supplierCrud.handleAdd(supplierWithAudit);
  }, [user, _supplierCrud]);

  const handleUpdateSupplier = useCallback(
    (supplier: Supplier) => _supplierCrud.handleUpdate(supplier),
    [_supplierCrud]
  );
  const handleDeleteSupplier = useCallback(
    (id: string) => _supplierCrud.handleDelete(id),
    [_supplierCrud]
  );

  // ============ INVOICE HANDLERS ============
  const handleAddInvoice = useCallback(async (invoice: Invoice) => {
    const originalStatus = invoice.status;
    const invoiceWithAudit: Invoice = {
      ...invoice,
      createdBy: user?.$id,
      createdByName: user?.name,
      createdAt: new Date().toISOString()
    };

    setters.setInvoices(prev => [invoiceWithAudit, ...prev]);

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.createInvoice(invoiceWithAudit);
        setters.setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? { ...saved, status: saved.status || originalStatus } : i));
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
        message: `${invoiceWithAudit.type === 'INCOME' ? 'Ingreso' : 'Gasto'} de ${invoiceWithAudit.issuerName} por ${(invoiceWithAudit.totalAmount ?? 0).toFixed(2)}€`,
        userId: user.$id,
        userName: user.name,
        relatedId: invoiceWithAudit.id
      });
    }

    // Auto-create supplier if needed
    if ((originalStatus === 'PROCESSED' || originalStatus === 'PAID') && invoiceWithAudit.issuerNif && invoiceWithAudit.issuerName) {
      const existingSupplier = data.suppliers.find(s =>
        s.nif.toUpperCase().replace(/\s/g, '') === invoiceWithAudit.issuerNif.toUpperCase().replace(/\s/g, '')
      );

      if (!existingSupplier) {
        const newSupplier: Supplier = {
          id: generateId(),
          name: invoiceWithAudit.issuerName,
          nif: invoiceWithAudit.issuerNif.toUpperCase(),
          nifType: detectNifType(invoiceWithAudit.issuerNif),
          address: invoiceWithAudit.issuerAddress,
          city: invoiceWithAudit.issuerCity,
          postalCode: invoiceWithAudit.issuerPostalCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user?.$id,
          createdByName: user?.name
        };
        handleAddSupplier(newSupplier);
        setters.setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? { ...i, supplierId: newSupplier.id } : i));
      } else if (!invoiceWithAudit.supplierId) {
        setters.setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? { ...i, supplierId: existingSupplier.id } : i));
      }
    }

    // Auto-create accounting entry
    if (originalStatus === 'PROCESSED' || originalStatus === 'PAID') {
      createEntryFromInvoice(invoiceWithAudit);
    }
  }, [user, data.settings, data.suppliers, setters, showError, addNotification, handleAddSupplier, createEntryFromInvoice]);

  const handleUpdateInvoice = useCallback(async (invoice: Invoice) => {
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
  }, [data.invoices, data.entries, data.settings, setters, showError, createEntryFromInvoice]);

  const handleDeleteInvoice = useCallback(async (id: string) => {
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
  }, [data.invoices, data.entries, data.settings, setters, showError, handleDeleteEntry]);

  // ============ BANK TRANSACTION HANDLERS ============
  const handleAddBankTransactions = useCallback(async (txs: BankTransaction[]) => {
    const txsWithAudit = txs.map(tx => ({
      ...tx,
      createdBy: user?.$id,
      createdByName: user?.name,
      createdAt: new Date().toISOString()
    }));

    setters.setTransactions(prev => [...prev, ...txsWithAudit]);

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await Promise.all(txsWithAudit.map(tx => appwriteService.createTransaction(tx)));
        setters.setTransactions(prev =>
          prev.map(t => {
            const s = saved.find(sv => sv.id === t.id);
            return s || t;
          })
        );
      } catch (error: unknown) {
        const ids = txsWithAudit.map(t => t.id);
        setters.setTransactions(prev => prev.filter(t => !ids.includes(t.id)));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar transacciones: ${errorMessage}`);
      }
    }
  }, [user, data.settings, setters, showError]);

  const handleUpdateBankTransaction = useCallback(async (tx: BankTransaction) => {
    setters.setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.databaseService.updateTransaction({ ...tx, appwriteId: tx.appwriteId || tx.id });
      } catch (error) {
        console.error('Error updating transaction:', error);
      }
    }
  }, [data.settings, setters]);

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
    (apt: Apartment) => _aptCrud.handleAdd(apt), [_aptCrud]
  );
  const handleUpdateApartment = useCallback(
    (apt: Apartment) => _aptCrud.handleUpdate(apt), [_aptCrud]
  );
  const handleDeleteApartment = useCallback(
    (id: string) => _aptCrud.handleDelete(id), [_aptCrud]
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
    (exp: RecurringExpense) => _expCrud.handleAdd(exp), [_expCrud]
  );
  const handleUpdateRecurringExpense = useCallback(
    (exp: RecurringExpense) => _expCrud.handleUpdate(exp), [_expCrud]
  );
  const handleDeleteRecurringExpense = useCallback(
    (id: string) => _expCrud.handleDelete(id), [_expCrud]
  );

  // ============ RESERVATION HANDLERS ============
  const handleAddReservations = useCallback(async (newReservations: Omit<Reservation, 'id'>[]) => {
    const reservationsWithIds: Reservation[] = newReservations.map(r => ({
      ...r,
      id: generateId()
    }));

    setters.setReservations(prev => [...reservationsWithIds, ...prev]);

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.createReservations(reservationsWithIds);
        setters.setReservations(prev => prev.map(r => {
          const s = saved.find(sv => sv.id === r.id);
          return s || r;
        }));
      } catch (error: unknown) {
        const ids = new Set(reservationsWithIds.map(r => r.id));
        setters.setReservations(prev => prev.filter(r => !ids.has(r.id)));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar reservas: ${errorMessage}`);
      }
    }
  }, [data.settings, setters, showError]);

  const handleUpdateReservation = useCallback(async (id: string, updates: Partial<Reservation>) => {
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
  }, [data.reservations, data.settings, setters, showError]);

  const handleDeleteReservation = useCallback(async (id: string) => {
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
  }, [data.reservations, data.settings, setters, showError]);

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
    // Settings handler
    handleUpdateSettings
  };
}
