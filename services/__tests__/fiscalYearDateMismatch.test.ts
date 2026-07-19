/**
 * @fileoverview Tests diagnoseFiscalYearDateMismatches y correctFiscalYearDateMismatches
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

import {
  diagnoseFiscalYearDateMismatches,
  correctFiscalYearDateMismatches,
} from '../appwrite/fiscalYearService';
import type { FiscalYear } from '../../types';

const fiscalYears: FiscalYear[] = [
  { id: 'fy-2028', appwriteId: 'fy-2028', year: 2028, status: 'OPEN' },
  { id: 'fy-2027', appwriteId: 'fy-2027', year: 2027, status: 'OPEN' },
];

describe('diagnoseFiscalYearDateMismatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue({});
  });

  it('detecta facturas de 2027 en ejercicio 2028', async () => {
    mockListDocuments.mockImplementation((_db, collectionId) => {
      if (collectionId === 'invoices-col') {
        return Promise.resolve({
          documents: [{
            $id: 'inv-wrong',
            fiscalYearId: 'fy-2028',
            date: '2027-06-15',
            number: 'FAC-001',
          }],
          total: 1,
        });
      }
      return Promise.resolve({ documents: [], total: 0 });
    });

    const report = await diagnoseFiscalYearDateMismatches(fiscalYears, {
      sourceFiscalYearId: 'fy-2028',
    });

    expect(report.summary.invoices).toBe(1);
    expect(report.summary.total).toBe(1);
    expect(report.mismatches[0].targetFiscalYearId).toBe('fy-2027');
  });
});

describe('correctFiscalYearDateMismatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue({});
  });

  it('actualiza fiscalYearId de documentos mal ubicados', async () => {
    const mismatches = [{
      collection: 'invoices' as const,
      documentId: 'inv-wrong',
      label: 'FAC-001',
      documentDate: '2027-06-15',
      documentYear: 2027,
      sourceFiscalYearId: 'fy-2028',
      sourceFiscalYear: 2028,
      targetFiscalYearId: 'fy-2027',
      targetFiscalYear: 2027,
    }];

    const result = await correctFiscalYearDateMismatches(mismatches);

    expect(result.corrected).toBe(1);
    expect(result.byCollection.invoices).toBe(1);
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'test-db',
      'invoices-col',
      'inv-wrong',
      { fiscalYearId: 'fy-2027' }
    );
  });
});
