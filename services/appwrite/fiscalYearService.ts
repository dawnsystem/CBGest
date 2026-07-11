/**
 * @fileoverview Servicio de ejercicios fiscales para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
  getErrorCode,
  getErrorMessage,
  buildMasterDataCopyDocumentId,
  getCopySourceDocumentId,
  listFiscalYearDocumentIds,
} from './infrastructure';
import { getSuppliers } from './supplierService';
import { getApartments } from './apartmentService';
import type { FiscalYear } from '../../types';

export async function createFiscalYear(fiscalYear: FiscalYear): Promise<FiscalYear> {
  try {
    const {
      id, appwriteId,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...data
    } = fiscalYear as any;

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.fiscalYears,
        id || ID.unique(),
        data
      ),
      'createFiscalYear'
    );

    notifySuccess('Ejercicio creado');
    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as FiscalYear;
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'createFiscalYear');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getFiscalYears(): Promise<FiscalYear[]> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.fiscalYears,
        [Query.orderDesc('year'), Query.limit(100)]
      ),
      'getFiscalYears'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => ({
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id
    })) as unknown as FiscalYear[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError(getErrorMessage(error), 'getFiscalYears');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateFiscalYear(fiscalYear: FiscalYear): Promise<FiscalYear> {
  try {
    const {
      id, appwriteId,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...data
    } = fiscalYear as any;
    const docId = appwriteId || id;
    if (!docId) {
      throw new Error('Fiscal year document id is required to update');
    }

    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.fiscalYears,
        docId,
        data
      ),
      'updateFiscalYear'
    );

    notifySuccess('Ejercicio actualizado');
    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as FiscalYear;
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'updateFiscalYear');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Asigna un ejercicio a todos los documentos transaccionales que no tienen fiscalYearId.
 */
export async function migrateLegacyData(
  fiscalYearId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ invoices: number; entries: number; transactions: number; reservations: number; suppliers: number; apartments: number }> {
  const BATCH = 100;
  const counts = { invoices: 0, entries: 0, transactions: 0, reservations: 0, suppliers: 0, apartments: 0 };

  const migrateCollection = async (
    collectionId: string,
    countKey: keyof typeof counts
  ) => {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const queries: Parameters<typeof databases.listDocuments>[2] = [
        Query.isNull('fiscalYearId'),
        Query.limit(BATCH)
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const response = await withRetry(
        () => databases.listDocuments(config.databaseId, collectionId, queries),
        `migrateLegacyData_${collectionId}`
      );

      if (response.documents.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of response.documents) {
        await withRetry(
          () => databases.updateDocument(config.databaseId, collectionId, doc.$id, { fiscalYearId }),
          `migrateLegacyData_update_${collectionId}`
        );
      }

      counts[countKey] += response.documents.length;
      onProgress?.(
        counts.invoices + counts.entries + counts.transactions + counts.reservations + counts.suppliers + counts.apartments,
        -1
      );

      if (response.documents.length < BATCH) {
        hasMore = false;
      } else {
        cursor = response.documents[response.documents.length - 1].$id;
      }
    }
  };

  await migrateCollection(config.collections.invoices, 'invoices');
  await migrateCollection(config.collections.entries, 'entries');
  await migrateCollection(config.collections.transactions, 'transactions');
  await migrateCollection(config.collections.reservations, 'reservations');
  await migrateCollection(config.collections.suppliers, 'suppliers');
  await migrateCollection(config.collections.apartments, 'apartments');

  return counts;
}

/**
 * Copia los datos maestros (proveedores y apartamentos) desde un ejercicio anterior
 * al nuevo ejercicio recién creado.
 */
export async function copyMasterDataToFiscalYear(
  sourceFiscalYearId: string,
  targetFiscalYearId: string,
  onProgress?: (phase: string, done: number, total: number) => void
): Promise<{ suppliers: number; apartments: number }> {
  const counts = { suppliers: 0, apartments: 0 };
  const [existingSupplierIds, existingApartmentIds] = await Promise.all([
    listFiscalYearDocumentIds(
      config.collections.suppliers,
      targetFiscalYearId,
      'copyMasterData_existingSuppliers'
    ),
    listFiscalYearDocumentIds(
      config.collections.apartments,
      targetFiscalYearId,
      'copyMasterData_existingApartments'
    )
  ]);

  // --- Copiar Proveedores ---
  const sourceSuppliers = await getSuppliers(sourceFiscalYearId);
  onProgress?.('Proveedores', 0, sourceSuppliers.length);

  for (const supplier of sourceSuppliers) {
    const newDocId = await buildMasterDataCopyDocumentId(
      'suppliers',
      targetFiscalYearId,
      getCopySourceDocumentId('suppliers', supplier)
    );

    if (existingSupplierIds.has(newDocId)) {
      continue;
    }

    try {
      const { id, appwriteId, $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions, ...supplierData } = supplier as any;
      await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.suppliers,
          newDocId,
          { ...supplierData, fiscalYearId: targetFiscalYearId }
        ),
        'copySupplierToFiscalYear'
      );
      counts.suppliers++;
      onProgress?.('Proveedores', counts.suppliers, sourceSuppliers.length);
    } catch (err) {
      if (getErrorCode(err) === 409) {
        counts.suppliers++;
        onProgress?.('Proveedores', counts.suppliers, sourceSuppliers.length);
      } else {
        dataLogger.debug(`[copyMasterData] Error copiando proveedor ${supplier.name}:`, err);
      }
    }
  }

  // --- Copiar Apartamentos ---
  const sourceApartments = await getApartments(sourceFiscalYearId);
  onProgress?.('Apartamentos', 0, sourceApartments.length);

  for (const apartment of sourceApartments) {
    const newDocId = await buildMasterDataCopyDocumentId(
      'apartments',
      targetFiscalYearId,
      getCopySourceDocumentId('apartments', apartment)
    );

    if (existingApartmentIds.has(newDocId)) {
      continue;
    }

    try {
      const { id, appwriteId, $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions, createdAt, updatedAt, ...apartmentData } = apartment as any;
      await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.apartments,
          newDocId,
          { ...apartmentData, fiscalYearId: targetFiscalYearId }
        ),
        'copyApartmentToFiscalYear'
      );
      counts.apartments++;
      onProgress?.('Apartamentos', counts.apartments, sourceApartments.length);
    } catch (err) {
      if (getErrorCode(err) === 409) {
        counts.apartments++;
        onProgress?.('Apartamentos', counts.apartments, sourceApartments.length);
      } else {
        dataLogger.debug(`[copyMasterData] Error copiando apartamento ${apartment.name}:`, err);
      }
    }
  }

  return counts;
}
