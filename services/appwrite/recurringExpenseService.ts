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

/**
 * Crea un gasto recurrente en Appwrite.
 *
 * @param expense - Gasto a persistir (incluye `fiscalYearId` si se inyectó en el handler)
 * @returns Documento guardado con `id`/`appwriteId`
 * @throws Si Appwrite rechaza la creación
 */
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

/**
 * Lista gastos recurrentes, opcionalmente filtrados por ejercicio (BUG-FY-002).
 *
 * @param fiscalYearId - Si se indica, solo documentos de ese ejercicio
 * @returns Lista de gastos recurrentes
 * @throws Si la consulta falla (404 → lista vacía)
 */
export async function getRecurringExpenses(fiscalYearId?: string): Promise<RecurringExpense[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderAsc('name'),
      Query.limit(500)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.recurringExpenses,
        queries
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

/**
 * Actualiza un gasto recurrente existente.
 *
 * @param expense - Gasto con cambios
 * @returns Documento actualizado
 * @throws Si Appwrite rechaza la actualización
 */
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

/**
 * Elimina un gasto recurrente por ID.
 *
 * @param id - Document ID
 * @throws Si Appwrite rechaza el borrado
 */
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
