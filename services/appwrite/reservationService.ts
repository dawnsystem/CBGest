/**
 * @fileoverview Servicio de reservas para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { Reservation } from '../../types';

export async function getReservations(fiscalYearId?: string): Promise<Reservation[]> {
  try {
    const queries: Parameters<typeof databases.listDocuments>[2] = [
      Query.orderDesc('checkIn'),
      Query.limit(5000)
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, config.collections.reservations, queries),
      'getReservations'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => {
      const {
        $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
        ...reservationData
      } = doc;
      return { ...reservationData, id: $id, appwriteId: $id } as Reservation;
    });
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getReservations');
    setConnectionHealth(false);
    throw error;
  }
}

export async function createReservation(reservation: Reservation): Promise<Reservation> {
  try {
    const {
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      appwriteId, file, id, ...reservationData
    } = reservation as any;

    const savedDoc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.reservations,
        id || ID.unique(),
        reservationData
      ),
      'createReservation'
    );

    setConnectionHealth(true);
    const {
      $id: savedId, $createdAt: _, $updatedAt: __, $databaseId: ___, $collectionId: ____, $permissions: _____,
      ...savedData
    } = savedDoc as any;
    return { ...savedData, id: savedId, appwriteId: savedId } as Reservation;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createReservation');
    setConnectionHealth(false);
    throw error;
  }
}

export async function createReservations(reservations: Reservation[]): Promise<Reservation[]> {
  const results: Reservation[] = [];

  for (const reservation of reservations) {
    try {
      const saved = await createReservation(reservation);
      results.push(saved);
    } catch (error) {
      console.error('Error creating reservation:', reservation.id, error);
    }
  }

  return results;
}

export async function updateReservation(reservation: Reservation): Promise<Reservation> {
  try {
    const docId = reservation.appwriteId || reservation.id;
    const {
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      appwriteId, file, id, ...reservationData
    } = reservation as any;

    const updatedDoc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.reservations,
        docId,
        reservationData
      ),
      'updateReservation'
    );

    setConnectionHealth(true);
    const {
      $id: updatedId, $createdAt: _, $updatedAt: __, $databaseId: ___, $collectionId: ____, $permissions: _____,
      ...updatedData
    } = updatedDoc as any;
    return { ...updatedData, id: updatedId, appwriteId: updatedId } as Reservation;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateReservation');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteReservation(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.reservations, id),
      'deleteReservation'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteReservation');
    setConnectionHealth(false);
    throw error;
  }
}
