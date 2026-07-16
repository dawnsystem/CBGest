/**
 * @fileoverview Servicio de transacciones bancarias para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  setConnectionHealth,
  listAllDocumentsPaginated,
} from './infrastructure';
import type { BankTransaction } from '../../types';

type BankTransactionDocument = AppwriteEntity<BankTransaction> & { $id: string };

export async function createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
  try {
    const { id } = transaction;
    const transactionData = omitFields(transaction as AppwriteEntity<BankTransaction>, [
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
    ]);

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
    const baseQueries: string[] = [Query.orderDesc('date')];
    if (fiscalYearId) {
      baseQueries.push(Query.equal('fiscalYearId', fiscalYearId));
    }

    const documents = await listAllDocumentsPaginated(
      config.collections.transactions,
      baseQueries,
      'getTransactions'
    );

    setConnectionHealth(true);
    return documents.map((doc) => {
      const transactionDoc = doc as unknown as BankTransactionDocument;
      return {
        ...transactionDoc,
        id: transactionDoc.$id,
        appwriteId: transactionDoc.$id
      };
    }) as BankTransaction[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getTransactions');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateTransaction(transaction: BankTransaction): Promise<BankTransaction> {
  try {
    const { id, appwriteId } = transaction;
    const transactionData = omitFields(transaction as AppwriteEntity<BankTransaction>, [
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
    ]);
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
