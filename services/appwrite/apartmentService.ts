/**
 * @fileoverview Servicio de apartamentos para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { Apartment } from '../../types';

export async function createApartment(apartment: Apartment): Promise<Apartment> {
  try {
    const {
      id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...apartmentData
    } = apartment as any;

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.apartments,
        id || ID.unique(),
        apartmentData
      ),
      'createApartment'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Apartment;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createApartment');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getApartments(fiscalYearId?: string): Promise<Apartment[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderAsc('name'),
      Query.limit(100)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.apartments, queries),
      'getApartments'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => ({
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id
    })) as unknown as Apartment[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getApartments');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateApartment(apartment: Apartment): Promise<Apartment> {
  try {
    const {
      id, appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...apartmentData
    } = apartment as any;
    const docId = appwriteId || id;

    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.apartments,
        docId,
        apartmentData
      ),
      'updateApartment'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Apartment;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateApartment');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteApartment(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.apartments, id),
      'deleteApartment'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteApartment');
    setConnectionHealth(false);
    throw error;
  }
}
