/**
 * @fileoverview Servicio de gastos recurrentes para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { RecurringExpense } from '../../types';

type RecurringExpenseDocument = AppwriteEntity<RecurringExpense> & { $id: string };

export async function createRecurringExpense(expense: RecurringExpense): Promise<RecurringExpense> {
  try {
    const { id } = expense;
    const expenseData = omitFields(expense as AppwriteEntity<RecurringExpense>, [
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
        config.collections.recurringExpenses,
        id || ID.unique(),
        expenseData
      ),
      'createRecurringExpense'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as RecurringExpense;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createRecurringExpense');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.recurringExpenses,
        [Query.orderAsc('name'), Query.limit(500)]
      ),
      'getRecurringExpenses'
    );

    setConnectionHealth(true);
    return response.documents.map((doc) => {
      const expenseDoc = doc as RecurringExpenseDocument;
      return {
        ...expenseDoc,
        id: expenseDoc.$id,
        appwriteId: expenseDoc.$id
      };
    }) as RecurringExpense[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getRecurringExpenses');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateRecurringExpense(expense: RecurringExpense): Promise<RecurringExpense> {
  try {
    const { id, appwriteId } = expense;
    const expenseData = omitFields(expense as AppwriteEntity<RecurringExpense>, [
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
      () => databases.updateDocument(
        config.databaseId,
        config.collections.recurringExpenses,
        docId,
        expenseData
      ),
      'updateRecurringExpense'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as RecurringExpense;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateRecurringExpense');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.recurringExpenses, id),
      'deleteRecurringExpense'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteRecurringExpense');
    setConnectionHealth(false);
    throw error;
  }
}
