/**
 * @fileoverview Hook para gestión de facturas
 * @description Encapsula la lógica de estado y operaciones CRUD de facturas
 */

import { useState, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { Invoice, AppSettings, Supplier, AccountingEntry } from '../types';
import { detectNifType } from '../utils/validators';
import { generateId } from '../utils/defaults';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { createLogger } from '../services/logger';

const logger = createLogger('InvoiceHook');

interface UseInvoicesOptions {
  settings: AppSettings;
  suppliers: Supplier[];
  accountingEntries: AccountingEntry[];
  showError: (message: string, autoClearMs?: number) => void;
  onAddSupplier: (supplier: Supplier) => void;
  onAddEntry: (entry: AccountingEntry) => void;
  onDeleteEntry: (id: string) => void;
}

interface UseInvoicesReturn {
  invoices: Invoice[];
  setInvoices: Dispatch<SetStateAction<Invoice[]>>;
  handleAddInvoice: (invoice: Invoice) => Promise<void>;
  handleUpdateInvoice: (invoice: Invoice) => Promise<void>;
  handleDeleteInvoice: (id: string) => Promise<void>;
}

export function useInvoices(options: UseInvoicesOptions): UseInvoicesReturn {
  const { settings, suppliers, accountingEntries, showError, onAddSupplier, onAddEntry, onDeleteEntry } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  // BUG-006: in-flight lock for supplier auto-creation.
  // Prevents duplicate suppliers when multiple invoices from the same issuer
  // are processed concurrently (e.g. bulk upload).
  const pendingSupplierNifs = useRef<Set<string>>(new Set());

  const createEntryFromInvoice = useCallback((inv: Invoice) => {
    let accountCode = inv.type === 'EXPENSE' ? '600' : '700';
    let accountName = inv.type === 'EXPENSE' ? 'Compras' : 'Ventas';

    if (inv.category) {
      const parts = inv.category.split(' - ');
      if (parts.length > 1) {
        accountCode = parts[0].trim();
        accountName = parts.slice(1).join(' - ').trim();
      } else {
        accountCode = parts[0].trim();
      }
    }

    const newEntry: AccountingEntry = {
      id: `AUTO-${inv.id}`,
      date: inv.date,
      concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
      // Multi-line entry for double-entry bookkeeping
      lines: [{
        accountCode: accountCode,
        accountName: accountName,
        debit: inv.type === 'EXPENSE' ? inv.totalAmount : 0,
        credit: inv.type === 'INCOME' ? inv.totalAmount : 0,
      }],
      // Legacy fields for compatibility
      accountCode: accountCode,
      accountName: accountName,
      debit: inv.type === 'EXPENSE' ? inv.totalAmount : 0,
      credit: inv.type === 'INCOME' ? inv.totalAmount : 0,
      invoiceId: inv.id,
      referenceDoc: inv.file,
      fileData: inv.fileData,
      fileType: inv.fileType,
      appwriteFileId: inv.appwriteFileId,
      reconciled: false,
      createdBy: inv.createdBy || user?.$id,
      createdByName: inv.createdByName || user?.name,
      createdAt: new Date().toISOString()
    };

    onAddEntry(newEntry);
  }, [user, onAddEntry]);

  const handleAddInvoice = useCallback(async (invoice: Invoice) => {
    const originalStatus = invoice.status;

    const invoiceWithAudit: Invoice = {
      ...invoice,
      createdBy: user?.$id,
      createdByName: user?.name,
      createdAt: new Date().toISOString()
    };
    const originalInvoice = { ...invoiceWithAudit };

    setInvoices(prev => [invoiceWithAudit, ...prev]);

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const savedInv = await appwriteService.createInvoice(invoiceWithAudit);
        const mergedInvoice = {
          ...savedInv,
          status: savedInv.status || originalStatus
        };
        setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? mergedInvoice : i));
      } catch (error: unknown) {
        setInvoices(prev => prev.filter(i => i.id !== invoiceWithAudit.id));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar factura: ${errorMessage}. Los cambios no se han guardado.`);
        logger.error('Error saving invoice to Appwrite:', error);
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

    if ((originalStatus === 'PROCESSED' || originalStatus === 'PAID') && invoiceWithAudit.issuerNif && invoiceWithAudit.issuerName) {
      const normalizedNif = invoiceWithAudit.issuerNif.toUpperCase().replace(/\s/g, '');
      const existingSupplier = suppliers.find(s =>
        s.nif.toUpperCase().replace(/\s/g, '') === normalizedNif
      );

      if (!existingSupplier && !pendingSupplierNifs.current.has(normalizedNif)) {
        // Acquire the in-flight lock before creating (BUG-006)
        pendingSupplierNifs.current.add(normalizedNif);
        const now = new Date().toISOString();
        const newSupplier: Supplier = {
          id: generateId(),
          name: invoiceWithAudit.issuerName,
          nif: normalizedNif,
          nifType: detectNifType(invoiceWithAudit.issuerNif),
          address: invoiceWithAudit.issuerAddress,
          city: invoiceWithAudit.issuerCity,
          postalCode: invoiceWithAudit.issuerPostalCode,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.$id,
          createdByName: user?.name
        };

        logger.info("Auto-creating supplier from invoice:", { name: newSupplier.name, nif: newSupplier.nif });
        onAddSupplier(newSupplier);
        pendingSupplierNifs.current.delete(normalizedNif);

        const updatedInvoice = { ...originalInvoice, supplierId: newSupplier.id };
        setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? updatedInvoice : i));
      } else if (!existingSupplier && pendingSupplierNifs.current.has(normalizedNif)) {
        logger.debug("Supplier creation already in-flight for NIF:", normalizedNif);
      } else if (existingSupplier && !invoiceWithAudit.supplierId) {
        const updatedInvoice = { ...originalInvoice, supplierId: existingSupplier.id };
        setInvoices(prev => prev.map(i => i.id === invoiceWithAudit.id ? updatedInvoice : i));
        logger.debug("Linked invoice to existing supplier:", existingSupplier.name);
      }
    }

    if (originalStatus === 'PROCESSED' || originalStatus === 'PAID') {
      logger.debug("Auto-creating entry for invoice:", { id: originalInvoice.id, status: originalStatus });
      createEntryFromInvoice(originalInvoice);
    } else {
      logger.debug("Invoice saved as PENDING - no accounting entry created yet:", originalInvoice.id);
    }
  }, [user, settings, suppliers, addNotification, showError, onAddSupplier, createEntryFromInvoice]);

  const handleUpdateInvoice = useCallback(async (invoice: Invoice) => {
    const oldInvoice = invoices.find(i => i.id === invoice.id);

    setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateInvoice(invoice);
      } catch (error: unknown) {
        if (oldInvoice) {
          setInvoices(prev => prev.map(i => i.id === invoice.id ? oldInvoice : i));
        }
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar factura: ${errorMessage}. Los cambios no se han guardado.`);
        logger.error('Error updating invoice in Appwrite:', error);
        return;
      }
    }

    if (user) {
      addNotification({
        type: 'INVOICE_UPDATED',
        title: 'Factura actualizada',
        message: `${invoice.issuerName} - Estado: ${invoice.status}`,
        userId: user.$id,
        userName: user.name,
        relatedId: invoice.id
      });
    }

    if (oldInvoice?.status === 'PENDING' && (invoice.status === 'PROCESSED' || invoice.status === 'PAID')) {
      const existingEntry = accountingEntries.find(e => e.invoiceId === invoice.id);
      if (!existingEntry) {
        logger.debug("Invoice status changed to PROCESSED/PAID - creating accounting entry:", invoice.id);
        createEntryFromInvoice(invoice);
      } else {
        logger.debug("Accounting entry already exists for invoice:", invoice.id);
      }
    }
  }, [invoices, settings, accountingEntries, user, addNotification, showError, createEntryFromInvoice]);

  const handleDeleteInvoice = useCallback(async (id: string) => {
    const invoice = invoices.find(i => i.id === id);

    setInvoices(prev => prev.filter(i => i.id !== id));

    if (settings.dataConfig?.type === 'APPWRITE' && invoice) {
      try {
        const docId = invoice.appwriteId || invoice.id;
        await appwriteService.deleteInvoice(docId);
        logger.success('Factura eliminada de Appwrite:', docId);
      } catch (error: unknown) {
        setInvoices(prev => [invoice, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar factura: ${errorMessage}. La factura no se ha eliminado.`);
        logger.error('Error deleting invoice from Appwrite:', error);
        return;
      }
    }

    if (user && invoice) {
      addNotification({
        type: 'INVOICE_DELETED',
        title: 'Factura eliminada',
        message: `${invoice.issuerName} - ${(invoice.totalAmount ?? 0).toFixed(2)}€`,
        userId: user.$id,
        userName: user.name,
        relatedId: id
      });
    }

    const relatedEntry = accountingEntries.find(e => e.invoiceId === id);
    if (relatedEntry) {
      onDeleteEntry(relatedEntry.id);
    }
  }, [invoices, settings, accountingEntries, user, addNotification, showError, onDeleteEntry]);

  return {
    invoices,
    setInvoices,
    handleAddInvoice,
    handleUpdateInvoice,
    handleDeleteInvoice
  };
}
