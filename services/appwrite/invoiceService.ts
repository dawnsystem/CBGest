/**
 * @fileoverview Servicio de facturas para Appwrite
 */

import { ID, Query } from 'appwrite';
import { databases, storage, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
} from './infrastructure';
import type { Invoice, InvoiceHistoryEvent } from '../../types';

type InvoiceDocument = AppwriteEntity<Invoice> & {
  $id: string;
  history?: string | string[] | InvoiceHistoryEvent[];
};

const stringifyHistoryEvent = (event: InvoiceHistoryEvent | string): string =>
  typeof event === 'string' ? event : JSON.stringify(event);

const parseHistoryEntry = (item: unknown): InvoiceHistoryEvent => {
  if (typeof item === 'string') {
    try {
      return JSON.parse(item) as InvoiceHistoryEvent;
    } catch {
      return { action: item, date: new Date().toISOString(), user: 'system' };
    }
  }

  return item as InvoiceHistoryEvent;
};

const parseInvoiceHistory = (history: InvoiceDocument['history']): InvoiceHistoryEvent[] => {
  if (Array.isArray(history)) {
    return history.map(parseHistoryEntry);
  }

  if (typeof history === 'string') {
    try {
      const parsed = JSON.parse(history) as unknown;
      return Array.isArray(parsed) ? parsed.map(parseHistoryEntry) : [];
    } catch {
      return [];
    }
  }

  return [];
};

export async function createInvoice(invoice: Invoice): Promise<Invoice> {
  try {
    const { file, history, id } = invoice;
    const restInvoiceData = omitFields(invoice as AppwriteEntity<Invoice> & {
      suggestedAccountCode?: string;
      matchedSupplierId?: string;
    }, [
      'file',
      'history',
      'id',
      'appwriteId',
      'createdAt',
      'updatedAt',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
      'issuerNifType',
      'issuerAddress',
      'issuerCity',
      'issuerPostalCode',
      'issuerCountry',
      'suggestedAccountCode',
      'matchedSupplierId',
      'fileData',
    ]);

    const historyArray = history && Array.isArray(history)
      ? history.map(stringifyHistoryEvent)
      : [];

    const invoiceData = { ...restInvoiceData, history: historyArray };

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.invoices,
        id || ID.unique(),
        invoiceData
      ),
      'createInvoice'
    );

    notifySuccess('Factura guardada');
    setConnectionHealth(true);

    const parsedHistory = parseInvoiceHistory((doc as InvoiceDocument).history);

    return {
      ...doc,
      file,
      id: doc.$id,
      appwriteId: doc.$id,
      history: parsedHistory
    } as unknown as Invoice;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createInvoice');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getInvoices(fiscalYearId?: string): Promise<Invoice[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderDesc('date'),
      Query.limit(1000)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.invoices, queries),
      'getInvoices'
    );

    setConnectionHealth(true);
    return response.documents.map((doc) => {
      const invoiceDoc = doc as InvoiceDocument;
      return {
        ...invoiceDoc,
        id: invoiceDoc.$id,
        appwriteId: invoiceDoc.$id,
        history: parseInvoiceHistory(invoiceDoc.history),
      };
    }) as Invoice[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getInvoices');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateInvoice(invoice: Invoice): Promise<Invoice> {
  try {
    const { file, history, appwriteId, id } = invoice;
    const restInvoiceData = omitFields(invoice as AppwriteEntity<Invoice> & {
      suggestedAccountCode?: string;
      matchedSupplierId?: string;
    }, [
      'file',
      'history',
      'id',
      'appwriteId',
      'createdAt',
      'updatedAt',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
      'issuerNifType',
      'issuerAddress',
      'issuerCity',
      'issuerPostalCode',
      'issuerCountry',
      'suggestedAccountCode',
      'matchedSupplierId',
      'fileData',
    ]);

    const historyArray = history && Array.isArray(history)
      ? history.map(stringifyHistoryEvent)
      : [];

    const invoiceData = { ...restInvoiceData, history: historyArray };
    const docId = appwriteId || id;

    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.invoices,
        docId,
        invoiceData
      ),
      'updateInvoice'
    );

    notifySuccess('Factura actualizada');
    setConnectionHealth(true);

    const parsedHistory = parseInvoiceHistory((doc as InvoiceDocument).history);

    return {
      ...doc,
      file,
      id: doc.$id,
      appwriteId: doc.$id,
      history: parsedHistory
    } as unknown as Invoice;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateInvoice');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.invoices, id),
      'deleteInvoice'
    );
    notifySuccess('Factura eliminada');
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteInvoice');
    setConnectionHealth(false);
    throw error;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS (with file upload support)
// ============================================================================

export async function createInvoiceWithFile(invoice: Invoice): Promise<Invoice> {
  let appwriteFileId: string | undefined;

  if (invoice.file) {
    dataLogger.cloud('Uploading invoice file:', invoice.file.name);
    const uploadedFile = await storage.createFile(config.bucketId, `invoice-${invoice.id}`, invoice.file);
    appwriteFileId = uploadedFile.$id;
  }

  const savedInvoice = await createInvoice({ ...invoice, appwriteFileId });
  return { ...savedInvoice, file: invoice.file, appwriteFileId };
}

export async function updateInvoiceWithFile(invoice: Invoice): Promise<Invoice> {
  let appwriteFileId = invoice.appwriteFileId;

  if (invoice.file && !invoice.appwriteFileId) {
    const uploadedFile = await storage.createFile(config.bucketId, `invoice-${invoice.id}`, invoice.file);
    appwriteFileId = uploadedFile.$id;
  }

  return await updateInvoice({ ...invoice, appwriteFileId });
}

export async function deleteInvoiceWithFile(invoiceId: string): Promise<void> {
  const invoices = await getInvoices();
  const invoice = invoices.find(inv => inv.id === invoiceId);

  if (invoice?.appwriteFileId) {
    try {
      await storage.deleteFile(config.bucketId, invoice.appwriteFileId);
    } catch (error) {
      console.warn('Could not delete file from storage:', error);
    }
  }

  await deleteInvoice(invoiceId);
}
