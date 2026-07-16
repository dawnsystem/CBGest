/**
 * @fileoverview Tests diagnoseFiscalYearVisibility (BUG-FY-004).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListDocuments } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
}));

vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
  },
  storage: {
    deleteFile: vi.fn(),
  },
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

import { diagnoseFiscalYearVisibility } from '../appwrite/fiscalYearService';

describe('diagnoseFiscalYearVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agrega conteos withFY / null / total por colección', async () => {
    // 7 collections × 3 queries (with, null, all)
    mockListDocuments.mockImplementation(async (_db: string, _col: string, queries: string[]) => {
      const joined = queries.join('|');
      if (joined.includes('equal')) {
        return { total: 0, documents: [] };
      }
      if (joined.includes('isNull')) {
        return { total: 12, documents: [] };
      }
      return { total: 12, documents: [] };
    });

    const report = await diagnoseFiscalYearVisibility('fy-2026');

    expect(report.fiscalYearId).toBe('fy-2026');
    expect(report.assignedTotal).toBe(0);
    expect(report.unassignedTotal).toBe(12 * 7);
    expect(report.hasQueryErrors).toBe(false);
    expect(report.collections.invoices.withoutFiscalYear).toBe(12);
    expect(report.collections.apartments.withFiscalYear).toBe(0);
  });

  it('marca hasQueryErrors si una colección falla', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((cb: () => void) => {
        cb();
        return 0;
      }) as typeof setTimeout
    );
    try {
      mockListDocuments.mockImplementation(async (_db: string, col: string) => {
        if (col === 'invoices-col') {
          throw new Error('Index not found: fiscalYearId_index');
        }
        return { total: 1, documents: [{ $id: 'x' }] };
      });

      const report = await diagnoseFiscalYearVisibility('fy-2026');
      expect(report.hasQueryErrors).toBe(true);
      expect(report.collections.invoices.queryError).toContain('Index not found');
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});