/**
 * @fileoverview Servicio de facturas para Appwrite
 */

import { ID } from 'appwrite';
import { databases, storage, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
} from './infrastructure';
import type { Invoice } from '../../types';

export async function createInvoice(invoice: Invoice): Promise<Invoice> {
  try {
    const {
      file, history, id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      issuerNifType, issuerAddress, issuerCity, issuerPostalCode, issuerCountry,
      suggestedAccountCode, matchedSupplierId,
      fileData,
      ...restInvoiceData
    } = invoice as any;

    const historyArray = history && Array.isArray(history)
      ? history.map((event: any) => typeof event === 'string' ? event : JSON.stringify(event))
      : [];

    const invoiceData = { ...restInvoiceData, history: historyArray };

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.invoices,
        invoice.id || ID.unique(),
        invoiceData
      ),
      'createInvoice'
    );

    notifySuccess('Factura guardada');
    setConnectionHealth(true);

    const parsedHistory = (doc.history && Array.isArray(doc.history))
      ? doc.history.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item)
      : [];

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
  const { Query } = await import('appwrite');
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
    return response.documents.map((doc: any) => {
      let parsedHistory: any[] = [];
      if (doc.history && Array.isArray(doc.history)) {
        parsedHistory = doc.history.map((item: any) => {
          if (typeof item === 'string') {
            try { return JSON.parse(item); }
            catch { return { action: item, date: new Date().toISOString(), user: 'system' }; }
          }
          return item;
        });
      } else if (doc.history && typeof doc.history === 'string') {
        try { parsedHistory = JSON.parse(doc.history); }
        catch { parsedHistory = []; }
      }
      return { ...doc, id: doc.$id, appwriteId: doc.$id, history: parsedHistory };
    }) as unknown as Invoice[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getInvoices');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateInvoice(invoice: Invoice): Promise<Invoice> {
  try {
    const {
      file, history, id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      issuerNifType, issuerAddress, issuerCity, issuerPostalCode, issuerCountry,
      suggestedAccountCode, matchedSupplierId,
      fileData,
      ...restInvoiceData
    } = invoice as any;

    const historyArray = history && Array.isArray(history)
      ? history.map((event: any) => typeof event === 'string' ? event : JSON.stringify(event))
      : [];

    const invoiceData = { ...restInvoiceData, history: historyArray };
    const docId = invoice.appwriteId || invoice.id;

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

    const parsedHistory = (doc.history && Array.isArray(doc.history))
      ? doc.history.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item)
      : [];

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
