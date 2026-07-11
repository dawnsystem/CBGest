/**
 * @fileoverview Servicio de transacciones bancarias para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  withRetry,
  notifyError,
  setConnectionHealth,
} from './infrastructure';
import type { BankTransaction } from '../../types';

export async function createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
  try {
    const {
      id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...transactionData
    } = transaction as any;

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.transactions,
        id || ID.unique(),
        transactionData
      ),
      'createTransaction'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankTransaction;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createTransaction');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getTransactions(fiscalYearId?: string): Promise<BankTransaction[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderDesc('date'),
      Query.limit(1000)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.transactions, queries),
      'getTransactions'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => ({
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id
    })) as unknown as BankTransaction[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getTransactions');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateTransaction(transaction: BankTransaction): Promise<BankTransaction> {
  try {
    const {
      id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...transactionData
    } = transaction as any;
    const docId = appwriteId || id;

    const doc = await withRetry(
      () => databases.updateDocument(config.databaseId, config.collections.transactions, docId, transactionData),
      'updateTransaction'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankTransaction;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateTransaction');
    setConnectionHealth(false);
    throw error;
  }
}
