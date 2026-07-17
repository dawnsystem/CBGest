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

function isUnknownAttributeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('unknown attribute') ||
    message.includes('invalid document structure') ||
    message.includes('contentfingerprint') ||
    message.includes('importbatchid')
  );
}

export async function createTransaction(transaction: BankTransaction): Promise<BankTransaction> {
  try {
    const { id } = transaction;
    const baseOmit = [
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
    ] as const;

    let transactionData = omitFields(transaction as AppwriteEntity<BankTransaction>, [...baseOmit]);

    let doc;
    try {
      doc = await withRetry(
        () =>
          databases.createDocument(
            config.databaseId,
            config.collections.transactions,
            id || ID.unique(),
            transactionData
          ),
        'createTransaction'
      );
    } catch (error: unknown) {
      if (!isUnknownAttributeError(error)) throw error;
      // Older Cloud schemas may lack dedup attrs — persist movement without them.
      transactionData = omitFields(transaction as AppwriteEntity<BankTransaction>, [
        ...baseOmit,
        'contentFingerprint',
        'importBatchId',
      ]);
      doc = await withRetry(
        () =>
          databases.createDocument(
            config.databaseId,
            config.collections.transactions,
            id || ID.unique(),
            transactionData
          ),
        'createTransactionFallback'
      );
    }

    setConnectionHealth(true);
    return {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
      contentFingerprint: transaction.contentFingerprint,
      importBatchId: transaction.importBatchId,
    } as unknown as BankTransaction;
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
