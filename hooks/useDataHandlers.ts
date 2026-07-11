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
  const withFiscalYearId = useCallback(<T extends { fiscalYearId?: string }>(item: T): T =>
    (item.fiscalYearId != null && item.fiscalYearId !== '') || !activeFiscalYearId
      ? item
      : { ...item, fiscalYearId: activeFiscalYearId },
  [activeFiscalYearId]);

  // ============ ENTRY HANDLERS ============
  const handleAddEntry = useCallback(async (entry: AccountingEntry) => {
    const isAutoGenerated = Boolean(entry.invoiceId);
    if (isReadOnly && !isAutoGenerated) {
      showToast?.('Ejercicio cerrado — no se pueden añadir asientos', 'error');
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

  const handleUpdateEntry = useCallback(async (entry: AccountingEntry) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden editar asientos', 'error');
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
    const entry = buildEntryFromInvoice(inv, { userId: user?.$id, userName: user?.name }, data.settings.fiscalRegime);
    handleAddEntry(entry);
  }, [user, data.settings.fiscalRegime, handleAddEntry]);

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
  const handleAddBankTransactions = useCallback(async (txs: BankTransaction[]) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden añadir transacciones', 'error');
      return;
    }
    const txsWithAudit = txs.map(tx => ({
      ...withFiscalYearId(tx),
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
  }, [isReadOnly, showToast, withFiscalYearId, user, data.settings, setters, showError]);

  const handleUpdateBankTransaction = useCallback(async (tx: BankTransaction) => {
    if (isReadOnly) {
      showToast?.('Ejercicio cerrado — no se pueden editar transacciones', 'error');
      return;
    }
    setters.setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));

    if (data.settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.databaseService.updateTransaction({ ...tx, appwriteId: tx.appwriteId || tx.id });
      } catch (error) {
        console.error('Error updating transaction:', error);
      }
    }
  }, [isReadOnly, showToast, data.settings, setters]);

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
      return _expCrud.handleAdd(exp);
    }, [isReadOnly, showToast, _expCrud]
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
          const savedReservations = await appwriteService.createReservations(toCreate);
          createdCount = savedReservations.length;
          setters.setReservations(prev => prev.map(r => {
            const saved = savedReservations.find(s => s.id === r.id);
            return saved || r;
          }));
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
    const isExpense = tx.amount < 0;
    const absAmount = Math.abs(tx.amount);
    const lines: AccountingEntry['lines'] = [];

    if (isExpense) {
      lines.push({ accountCode: '626', accountName: 'Servicios bancarios y similares', debit: absAmount, credit: 0 });
      lines.push({ accountCode: '572', accountName: 'Bancos e instituciones de crédito c/c vista, euros', debit: 0, credit: absAmount });
    } else {
      lines.push({ accountCode: '572', accountName: 'Bancos e instituciones de crédito c/c vista, euros', debit: absAmount, credit: 0 });
      lines.push({ accountCode: '769', accountName: 'Otros ingresos financieros', debit: 0, credit: absAmount });
    }

    const newEntry: AccountingEntry = {
      id: `BANK-${tx.id}`,
      date: tx.date,
      concept: tx.concept,
      lines,
      accountCode: lines[0].accountCode,
      accountName: lines[0].accountName,
      debit: lines[0].debit,
      credit: lines[0].credit,
      transactionId: tx.id,
      reconciled: true
    };
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

    if (sourceType === 'IMPORTED') {
      const transaction = data.transactions.find(t => t.id === sourceId);
      if (!transaction) return;
      await handleUpdateBankTransaction({ ...transaction, status: 'MATCHED', reconciledWithEntryId: matchedEntryId });
      await handleUpdateEntry({ ...matchedEntry, reconciled: true });
    } else {
      const bankEntry = data.entries.find(e => e.id === sourceId);
      if (!bankEntry) return;
      await handleUpdateEntry({ ...bankEntry, reconciled: true });
      await handleUpdateEntry({ ...matchedEntry, reconciled: true });
    }
  }, [data.entries, data.transactions, handleUpdateBankTransaction, handleUpdateEntry]);

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
