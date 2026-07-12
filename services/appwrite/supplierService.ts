/**
 * @fileoverview Servicio de proveedores para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
} from './infrastructure';
import type { Supplier } from '../../types';

type SupplierDocument = AppwriteEntity<Supplier> & { $id: string };

export async function createSupplier(supplier: Supplier): Promise<Supplier> {
  try {
    const { id } = supplier;
    const supplierData = omitFields(supplier as AppwriteEntity<Supplier>, [
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
        config.collections.suppliers,
        id || ID.unique(),
        supplierData
      ),
      'createSupplier'
    );

    notifySuccess('Proveedor creado');
    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createSupplier');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getSuppliers(fiscalYearId?: string): Promise<Supplier[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderAsc('name'),
      Query.limit(1000)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.suppliers, queries),
      'getSuppliers'
    );

    setConnectionHealth(true);
    return response.documents.map((doc) => {
      const supplierDoc = doc as SupplierDocument;
      return {
        ...supplierDoc,
        id: supplierDoc.$id,
        appwriteId: supplierDoc.$id
      };
    }) as Supplier[];
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getSuppliers');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateSupplier(supplier: Supplier): Promise<Supplier> {
  try {
    const { id, appwriteId } = supplier;
    const supplierData = omitFields(supplier as AppwriteEntity<Supplier>, [
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
        config.collections.suppliers,
        docId,
        supplierData
      ),
      'updateSupplier'
    );

    notifySuccess('Proveedor actualizado');
    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Supplier;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateSupplier');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteSupplier(appwriteId: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.suppliers, appwriteId),
      'deleteSupplier'
    );
    notifySuccess('Proveedor eliminado');
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteSupplier');
    setConnectionHealth(false);
    throw error;
  }
}
