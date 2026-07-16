/**
 * @fileoverview Tests BUG-RES-001 — createReservations reporta parciales.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockCreateDocument } = vi.hoisted(() => ({
  mockCreateDocument: vi.fn(),
}));

vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    createDocument: mockCreateDocument,
    listDocuments: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  config: {
    databaseId: 'test-db',
    collections: {
      reservations: 'reservations-col',
    },
  },
}));

vi.mock('appwrite');

import { createReservations } from '../appwrite/reservationService';
import type { Reservation } from '../../types';

const makeReservation = (id: string, number = 'N-1'): Reservation => ({
  id,
  apartmentId: 'apt-1',
  apartmentName: 'A1',
  checkIn: '2026-01-01',
  checkOut: '2026-01-05',
  nights: 4,
  pricePerNight: 50,
  totalAmount: 200,
  paidAmount: 200,
  channel: 'Airbnb',
  reservationNumber: number,
  status: 'Confirmed',
  guestInitials: 'AB',
  numberOfGuests: 2,
  numberOfChildren: 0,
  touristTaxAmount: 0,
  touristTaxCollected: false,
  touristTaxNightsCounted: 0,
  depositAmount: 100,
  depositCollected: false,
  depositReturned: false,
  depositRetainedAmount: 0,
});

describe('createReservations — BUG-RES-001', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve created y failed por separado cuando un ítem falla', async () => {
    mockCreateDocument.mockImplementation((_db: string, _col: string, id: string) => {
      if (id === 'res-bad') {
        return Promise.reject(new Error('network fail'));
      }
      return Promise.resolve({
        $id: id,
        apartmentId: 'apt-1',
        checkIn: '2026-01-01',
        checkOut: '2026-01-05',
        nights: 4,
        totalAmount: 200,
        paidAmount: 200,
        channel: 'Airbnb',
        reservationNumber: 'OK-1',
        status: 'Confirmed',
      });
    });

    // Evitar esperas reales de withRetry (errores de red reintentan)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: Parameters<typeof setTimeout>[0]) => {
      if (typeof cb === 'function') cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      const result = await createReservations([
        makeReservation('res-ok', 'OK-1'),
        makeReservation('res-bad', 'BAD-1'),
      ]);

      expect(result.created).toHaveLength(1);
      expect(result.created[0].id).toBe('res-ok');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        id: 'res-bad',
        reservationNumber: 'BAD-1',
        error: 'network fail',
      });
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('devuelve failed vacío cuando todas se crean', async () => {
    mockCreateDocument.mockResolvedValue({
      $id: 'res-1',
      apartmentId: 'apt-1',
      checkIn: '2026-01-01',
      checkOut: '2026-01-05',
      nights: 4,
      totalAmount: 200,
      paidAmount: 200,
      channel: 'Airbnb',
      status: 'Confirmed',
    });

    const result = await createReservations([makeReservation('res-1')]);

    expect(result.created).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });
});
