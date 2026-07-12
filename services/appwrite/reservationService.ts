/**
 * @fileoverview Servicio de reservas para Appwrite
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
import type { Reservation } from '../../types';

type ReservationDocument = AppwriteEntity<Reservation> & { $id: string };

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
    return response.documents.map((doc) => {
      const reservationDoc = doc as ReservationDocument;
      const reservationData = omitFields(reservationDoc, [
        '$createdAt',
        '$updatedAt',
        '$databaseId',
        '$collectionId',
        '$permissions',
      ]);
      const { $id } = reservationDoc;
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
    const { id } = reservation;
    const reservationData = omitFields(
      reservation as AppwriteEntity<Reservation> & { file?: File },
      ['id', 'appwriteId', 'file', '$id', '$createdAt', '$updatedAt', '$databaseId', '$collectionId', '$permissions']
    );

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
      $id: savedId,
      ...savedData
    } = omitFields(savedDoc as ReservationDocument, [
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);
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
    const reservationData = omitFields(
      reservation as AppwriteEntity<Reservation> & { file?: File },
      ['id', 'appwriteId', 'file', '$id', '$createdAt', '$updatedAt', '$databaseId', '$collectionId', '$permissions']
    );

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
      $id: updatedId,
      ...updatedData
    } = omitFields(updatedDoc as ReservationDocument, [
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);
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
