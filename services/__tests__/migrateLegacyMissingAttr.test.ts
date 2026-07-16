/**
 * @fileoverview Tests migrateLegacyData cuando falta el atributo fiscalYearId (BUG-FY-004b).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListDocuments, mockUpdateDocument } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
  mockUpdateDocument: vi.fn(),
}));

vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
    updateDocument: mockUpdateDocument,
  },
  storage: { deleteFile: vi.fn() },
  config: {
    databaseId: 'test-db',
    bucketId: 'test-bucket',
    collections: {
      invoices: 'invoices-col',
      entries: 'entries-col',
      transactions: 'transactions-col',
      reservations: 'reservations-col',
      suppliers: 'suppliers-col',
      apartments: 'apartments-col',
      recurringExpenses: 'recurring-col',
      fiscalYears: 'fiscal-years-col',
    },
  },
}));

vi.mock('appwrite');

import { migrateLegacyData } from '../appwrite/fiscalYearService';

describe('migrateLegacyData — atributo fiscalYearId ausente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza mensaje accionable si Appwrite dice que fiscalYearId no existe', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((cb: () => void) => {
        cb();
        return 0;
      }) as typeof setTimeout
    );

    try {
      mockListDocuments.mockRejectedValue(
        new Error('Attribute not found in schema: fiscalYearId')
      );

      await expect(migrateLegacyData('fy-2026')).rejects.toThrow(
        /no tiene el atributo fiscalYearId/
      );
      await expect(migrateLegacyData('fy-2026')).rejects.toThrow(
        /add-fiscal-year-id-attributes/
      );
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
