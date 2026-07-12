/**
 * @fileoverview Servicio de ejercicios fiscales para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, storage, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  AppwriteEntity,
  withRetry,
  notifyError,
  notifySuccess,
  setConnectionHealth,
  getErrorCode,
  getErrorMessage,
  buildMasterDataCopyDocumentId,
  getCopySourceDocumentId,
  listFiscalYearDocumentIds,
  omitFields,
} from './infrastructure';
import { getSuppliers } from './supplierService';
import { getApartments } from './apartmentService';
import type { FiscalYear, FiscalYearDependencies } from '../../types';

type FiscalYearDocument = AppwriteEntity<FiscalYear> & { $id: string };

export async function createFiscalYear(fiscalYear: FiscalYear): Promise<FiscalYear> {
  try {
    const { id } = fiscalYear;
    const data = omitFields(fiscalYear as AppwriteEntity<FiscalYear>, [
      'id',
      'appwriteId',
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
    return response.documents.map((doc) => {
      const fiscalYearDoc = doc as FiscalYearDocument;
      return {
        ...fiscalYearDoc,
        id: fiscalYearDoc.$id,
        appwriteId: fiscalYearDoc.$id
      };
    }) as FiscalYear[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError(getErrorMessage(error), 'getFiscalYears');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateFiscalYear(fiscalYear: FiscalYear): Promise<FiscalYear> {
  try {
    const { id, appwriteId } = fiscalYear;
    const data = omitFields(fiscalYear as AppwriteEntity<FiscalYear>, [
      'id',
      'appwriteId',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);
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
      const supplierData = omitFields(supplier as AppwriteEntity<typeof supplier>, [
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
      const apartmentData = omitFields(apartment as AppwriteEntity<typeof apartment>, [
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

// ============================================================================
// ELIMINAR EJERCICIO
// ============================================================================

/**
 * Devuelve el número de documentos asociados a un ejercicio en cada colección.
 * Si el total es 0, el ejercicio está vacío y puede borrarse sin cascada.
 */
export async function getFiscalYearDependencies(fiscalYearId: string): Promise<FiscalYearDependencies> {
  const countCollection = async (collectionId: string): Promise<number> => {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        collectionId,
        [Query.equal('fiscalYearId', fiscalYearId), Query.limit(1)]
      ),
      `getFiscalYearDeps_${collectionId}`
    );
    return response.total;
  };

  const [invoices, entries, transactions, reservations, suppliers, apartments] = await Promise.all([
    countCollection(config.collections.invoices),
    countCollection(config.collections.entries),
    countCollection(config.collections.transactions),
    countCollection(config.collections.reservations),
    countCollection(config.collections.suppliers),
    countCollection(config.collections.apartments),
  ]);

  return {
    invoices,
    entries,
    transactions,
    reservations,
    suppliers,
    apartments,
    total: invoices + entries + transactions + reservations + suppliers + apartments,
  };
}

/**
 * Elimina únicamente el documento del ejercicio en Appwrite.
 * Solo debe llamarse cuando el ejercicio está vacío de datos asociados.
 */
export async function deleteFiscalYear(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.fiscalYears, id),
      'deleteFiscalYear'
    );
    notifySuccess('Ejercicio eliminado');
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'deleteFiscalYear');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Elimina en cascada todos los datos de un ejercicio y el propio ejercicio.
 * El orden es: facturas (+ archivos adjuntos), asientos, transacciones,
 * reservas, proveedores, apartamentos y finalmente el ejercicio.
 *
 * @param fiscalYearId  - Document ID del ejercicio (= valor de `fiscalYearId` en los docs hijos)
 * @param onProgress    - Callback opcional con (nombreFase, documentosEliminados)
 */
export async function deleteFiscalYearCascade(
  fiscalYearId: string,
  onProgress?: (phase: string, done: number) => void
): Promise<void> {
  try {
    const deleteAll = async (collectionId: string, phaseName: string) => {
      let cursor: string | undefined;
      let done = 0;

      for (;;) {
        const queries: Parameters<typeof databases.listDocuments>[2] = [
          Query.equal('fiscalYearId', fiscalYearId),
          Query.limit(100),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const res = await withRetry(
          () => databases.listDocuments(config.databaseId, collectionId, queries),
          `deleteFYCascade_${collectionId}`
        );

        if (res.documents.length === 0) break;

        for (const doc of res.documents) {
          // Para facturas: eliminar también el archivo adjunto en Storage si existe
          if (collectionId === config.collections.invoices) {
            const fileId = (doc as { appwriteFileId?: string }).appwriteFileId;
            if (fileId) {
              try {
                await storage.deleteFile(config.bucketId, fileId);
              } catch (storageErr) {
                // El documento se borrará igualmente, pero registramos el error para
                // facilitar la limpieza manual de archivos huérfanos en Storage.
                console.warn(`[deleteFiscalYearCascade] No se pudo eliminar el archivo ${fileId} del bucket:`, storageErr);
              }
            }
          }

          await withRetry(
            () => databases.deleteDocument(config.databaseId, collectionId, doc.$id),
            `deleteFYCascade_del_${collectionId}`
          );
          done++;
          onProgress?.(phaseName, done);
        }

        if (res.documents.length < 100) break;
        cursor = res.documents[res.documents.length - 1].$id;
      }
    };

    await deleteAll(config.collections.invoices, 'Facturas');
    await deleteAll(config.collections.entries, 'Asientos');
    await deleteAll(config.collections.transactions, 'Transacciones');
    await deleteAll(config.collections.reservations, 'Reservas');
    await deleteAll(config.collections.suppliers, 'Proveedores');
    await deleteAll(config.collections.apartments, 'Apartamentos');

    // Por último, eliminar el propio ejercicio
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.fiscalYears, fiscalYearId),
      'deleteFYCascade_fiscalYear'
    );

    notifySuccess('Ejercicio y todos sus datos eliminados correctamente');
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'deleteFiscalYearCascade');
    setConnectionHealth(false);
    throw error;
  }
}
