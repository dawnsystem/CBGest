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
import { getRecurringExpenses } from './recurringExpenseService';
import type { FiscalYear, FiscalYearDependencies, TouristTaxPeriod } from '../../types';
import {
  parseTouristTaxPeriods,
  serializeTouristTaxPeriods,
} from '../../utils/touristTaxUtils';

type FiscalYearDocument = AppwriteEntity<FiscalYear> & { $id: string };

/**
 * Convierte un documento de Appwrite en un objeto FiscalYear,
 * manteniendo touristTaxPeriods como string JSON (la deserialización
 * a array ocurre en getPeriodsForFiscalYear de touristTaxUtils).
 */
function docToFiscalYear(doc: FiscalYearDocument): FiscalYear {
  return {
    ...doc,
    id: doc.$id,
    appwriteId: doc.$id,
  } as unknown as FiscalYear;
}

export async function createFiscalYear(fiscalYear: FiscalYear): Promise<FiscalYear> {
  try {
    const { id } = fiscalYear;
    const dataRaw = omitFields(fiscalYear as AppwriteEntity<FiscalYear>, [
      'id',
      'appwriteId',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);

    // Asegurar que touristTaxPeriods se almacena como string JSON
    const data = {
      ...dataRaw,
      touristTaxPeriods: fiscalYear.touristTaxPeriods
        ? serializeTouristTaxPeriods(parseTouristTaxPeriods(fiscalYear.touristTaxPeriods))
        : undefined,
    };

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
    return docToFiscalYear(doc as FiscalYearDocument);
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
      return docToFiscalYear(doc as FiscalYearDocument);
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
    const dataRaw = omitFields(fiscalYear as AppwriteEntity<FiscalYear>, [
      'id',
      'appwriteId',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);
    const data = {
      ...dataRaw,
      touristTaxPeriods: fiscalYear.touristTaxPeriods
        ? serializeTouristTaxPeriods(parseTouristTaxPeriods(fiscalYear.touristTaxPeriods))
        : undefined,
    };
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
    return docToFiscalYear(doc as FiscalYearDocument);
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'updateFiscalYear');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Actualiza únicamente los períodos de vigencia de la tasa turística de un ejercicio.
 * Es más eficiente que updateFiscalYear cuando solo cambia esta sección.
 *
 * @param fiscalYearDocId - Document ID del ejercicio en Appwrite (appwriteId || id)
 * @param periods         - Array actualizado de períodos de vigencia
 * @returns El ejercicio actualizado
 *
 * @example
 * await updateFiscalYearTouristTax(activeFiscalYear.appwriteId, updatedPeriods);
 */
export async function updateFiscalYearTouristTax(
  fiscalYearDocId: string,
  periods: TouristTaxPeriod[]
): Promise<FiscalYear> {
  try {
    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.fiscalYears,
        fiscalYearDocId,
        { touristTaxPeriods: serializeTouristTaxPeriods(periods) }
      ),
      'updateFiscalYearTouristTax'
    );

    setConnectionHealth(true);
    return docToFiscalYear(doc as FiscalYearDocument);
  } catch (error: unknown) {
    notifyError(getErrorMessage(error), 'updateFiscalYearTouristTax');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Asigna un ejercicio a todos los documentos transaccionales/maestros que no tienen fiscalYearId.
 */
export async function migrateLegacyData(
  fiscalYearId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{
  invoices: number;
  entries: number;
  transactions: number;
  reservations: number;
  suppliers: number;
  apartments: number;
  recurringExpenses: number;
}> {
  const BATCH = 100;
  const counts = {
    invoices: 0,
    entries: 0,
    transactions: 0,
    reservations: 0,
    suppliers: 0,
    apartments: 0,
    recurringExpenses: 0,
  };

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
        counts.invoices + counts.entries + counts.transactions + counts.reservations
          + counts.suppliers + counts.apartments + counts.recurringExpenses,
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
  await migrateCollection(config.collections.recurringExpenses, 'recurringExpenses');

  return counts;
}

/**
 * Copia datos maestros (proveedores, apartamentos y gastos recurrentes) desde un ejercicio
 * anterior al nuevo. Remapea `apartmentId`/`supplierId` de recurrentes a los IDs destino (BUG-FY-002).
 */
export async function copyMasterDataToFiscalYear(
  sourceFiscalYearId: string,
  targetFiscalYearId: string,
  onProgress?: (phase: string, done: number, total: number) => void
): Promise<{ suppliers: number; apartments: number; recurringExpenses: number }> {
  const counts = { suppliers: 0, apartments: 0, recurringExpenses: 0 };
  const [existingSupplierIds, existingApartmentIds, existingRecurringIds] = await Promise.all([
    listFiscalYearDocumentIds(
      config.collections.suppliers,
      targetFiscalYearId,
      'copyMasterData_existingSuppliers'
    ),
    listFiscalYearDocumentIds(
      config.collections.apartments,
      targetFiscalYearId,
      'copyMasterData_existingApartments'
    ),
    listFiscalYearDocumentIds(
      config.collections.recurringExpenses,
      targetFiscalYearId,
      'copyMasterData_existingRecurring'
    ),
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

  // --- Copiar Gastos Recurrentes (remap apartmentId / supplierId) ---
  const sourceRecurring = await getRecurringExpenses(sourceFiscalYearId);
  onProgress?.('Gastos recurrentes', 0, sourceRecurring.length);

  for (const expense of sourceRecurring) {
    const sourceId = getCopySourceDocumentId('recurringExpenses', expense);
    const newDocId = await buildMasterDataCopyDocumentId(
      'recurringExpenses',
      targetFiscalYearId,
      sourceId
    );

    if (existingRecurringIds.has(newDocId)) {
      continue;
    }

    try {
      const expenseData = omitFields(expense as AppwriteEntity<typeof expense>, [
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

      let remappedApartmentId = expenseData.apartmentId;
      if (expense.apartmentId) {
        remappedApartmentId = await buildMasterDataCopyDocumentId(
          'apartments',
          targetFiscalYearId,
          expense.apartmentId
        );
      }

      let remappedSupplierId = expenseData.supplierId;
      if (expense.supplierId) {
        remappedSupplierId = await buildMasterDataCopyDocumentId(
          'suppliers',
          targetFiscalYearId,
          expense.supplierId
        );
      }

      await withRetry(
        () => databases.createDocument(
          config.databaseId,
          config.collections.recurringExpenses,
          newDocId,
          {
            ...expenseData,
            fiscalYearId: targetFiscalYearId,
            apartmentId: remappedApartmentId,
            supplierId: remappedSupplierId,
          }
        ),
        'copyRecurringExpenseToFiscalYear'
      );
      counts.recurringExpenses++;
      onProgress?.('Gastos recurrentes', counts.recurringExpenses, sourceRecurring.length);
    } catch (err) {
      if (getErrorCode(err) === 409) {
        counts.recurringExpenses++;
        onProgress?.('Gastos recurrentes', counts.recurringExpenses, sourceRecurring.length);
      } else {
        dataLogger.debug(`[copyMasterData] Error copiando gasto recurrente ${expense.name}:`, err);
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

  const [invoices, entries, transactions, reservations, suppliers, apartments, recurringExpenses] = await Promise.all([
    countCollection(config.collections.invoices),
    countCollection(config.collections.entries),
    countCollection(config.collections.transactions),
    countCollection(config.collections.reservations),
    countCollection(config.collections.suppliers),
    countCollection(config.collections.apartments),
    countCollection(config.collections.recurringExpenses),
  ]);

  return {
    invoices,
    entries,
    transactions,
    reservations,
    suppliers,
    apartments,
    recurringExpenses,
    total: invoices + entries + transactions + reservations + suppliers + apartments + recurringExpenses,
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
    await deleteAll(config.collections.recurringExpenses, 'Gastos recurrentes');

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
