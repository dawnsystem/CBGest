/**
 * @fileoverview Servicio de asientos contables para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
} from './infrastructure';
import type { AccountingEntry } from '../../types';

export async function createEntry(entry: AccountingEntry): Promise<AccountingEntry> {
  try {
    const {
      referenceDoc, id, appwriteId, lines,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...entryData
    } = entry as any;

    const dataToSave = {
      ...entryData,
      lines: lines && Array.isArray(lines) && lines.length > 0
        ? JSON.stringify(lines)
        : undefined,
      accountCode: lines?.[0]?.accountCode || entryData.accountCode,
      accountName: lines?.[0]?.accountName || entryData.accountName,
      debit: lines?.[0]?.debit ?? entryData.debit ?? 0,
      credit: lines?.[0]?.credit ?? entryData.credit ?? 0,
    };

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.entries,
        id || ID.unique(),
        dataToSave
      ),
      'createEntry'
    );

    setConnectionHealth(true);

    const parsedLines = doc.lines
      ? (typeof doc.lines === 'string' ? JSON.parse(doc.lines) : doc.lines)
      : [];

    return {
      ...doc,
      referenceDoc,
      id: doc.$id,
      appwriteId: doc.$id,
      lines: parsedLines.length > 0 ? parsedLines : [{
        accountCode: doc.accountCode || '',
        accountName: doc.accountName || '',
        debit: doc.debit || 0,
        credit: doc.credit || 0
      }]
    } as unknown as AccountingEntry;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createEntry');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getEntries(fiscalYearId?: string): Promise<AccountingEntry[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderDesc('date'),
      Query.limit(1000)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.entries, queries),
      'getEntries'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => {
      let parsedLines: any[] = [];
      if (doc.lines) {
        try {
          parsedLines = typeof doc.lines === 'string' ? JSON.parse(doc.lines) : doc.lines;
        } catch {
          parsedLines = [];
        }
      }

      if (parsedLines.length === 0 && doc.accountCode) {
        parsedLines = [{
          accountCode: doc.accountCode || '',
          accountName: doc.accountName || '',
          debit: doc.debit || 0,
          credit: doc.credit || 0
        }];
      }

      return { ...doc, id: doc.$id, appwriteId: doc.$id, lines: parsedLines };
    }) as unknown as AccountingEntry[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getEntries');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateEntry(entry: AccountingEntry): Promise<AccountingEntry> {
  try {
    const {
      referenceDoc, id, appwriteId, lines,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...entryData
    } = entry as any;
    const docId = appwriteId || id;

    const dataToSave = {
      ...entryData,
      lines: lines && Array.isArray(lines) && lines.length > 0
        ? JSON.stringify(lines)
        : undefined,
      accountCode: lines?.[0]?.accountCode || entryData.accountCode,
      accountName: lines?.[0]?.accountName || entryData.accountName,
      debit: lines?.[0]?.debit ?? entryData.debit ?? 0,
      credit: lines?.[0]?.credit ?? entryData.credit ?? 0,
    };

    const doc = await withRetry(
      () => databases.updateDocument(config.databaseId, config.collections.entries, docId, dataToSave),
      'updateEntry'
    );

    setConnectionHealth(true);

    const parsedLines = doc.lines
      ? (typeof doc.lines === 'string' ? JSON.parse(doc.lines) : doc.lines)
      : [];

    return {
      ...doc,
      referenceDoc,
      id: doc.$id,
      appwriteId: doc.$id,
      lines: parsedLines.length > 0 ? parsedLines : [{
        accountCode: doc.accountCode || '',
        accountName: doc.accountName || '',
        debit: doc.debit || 0,
        credit: doc.credit || 0
      }]
    } as unknown as AccountingEntry;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateEntry');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteEntry(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.entries, id),
      'deleteEntry'
    );
    notifySuccess('Asiento eliminado');
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteEntry');
    setConnectionHealth(false);
    throw error;
  }
}
