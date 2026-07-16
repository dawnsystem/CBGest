/**
 * @fileoverview Tests for copyMasterDataToFiscalYear idempotency paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoist mock fns so they are available inside vi.mock factories ─────────────
const { mockListDocuments, mockCreateDocument } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
  mockCreateDocument: vi.fn(),
}));

// ── Controlled mock for databases ────────────────────────────────────────────
vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
    createDocument: mockCreateDocument,
  },
  config: {
    databaseId: 'test-db',
    collections: {
      suppliers: 'suppliers-col',
      apartments: 'apartments-col',
      recurringExpenses: 'recurring-col',
    },
  },
}));

// We still need the appwrite module mock for Query, ID, AppwriteException, etc.
vi.mock('appwrite');

// ── Import after mocks are set up ────────────────────────────────────────────
import { buildMasterDataCopyDocumentId, databaseService } from '../appwriteService';
import { AppwriteException } from 'appwrite';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an Appwrite-like supplier document. */
const makeSupplier = (id = 'src-supplier-1') => ({
  $id: id,
  $collectionId: 'suppliers-col',
  $databaseId: 'test-db',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  name: 'Test Supplier',
  fiscalYearId: 'source-fy',
});

/** Creates an Appwrite-like apartment document. */
const makeApartment = (id = 'src-apartment-1') => ({
  $id: id,
  $collectionId: 'apartments-col',
  $databaseId: 'test-db',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  name: 'Test Apartment',
  fiscalYearId: 'source-fy',
});

/** Creates an Appwrite-like recurring expense document. */
const makeRecurring = (id = 'src-recurring-1', apartmentId?: string) => ({
  $id: id,
  $collectionId: 'recurring-col',
  $databaseId: 'test-db',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  name: 'Comunidad',
  estimatedAmount: 100,
  frequency: 'MONTHLY',
  isDeductible: true,
  isActive: true,
  apartmentId,
  fiscalYearId: 'source-fy',
});

/** Creates a 409 Appwrite exception (document already exists). */
const make409 = () => new AppwriteException('Document with the requested ID already exists.', 409, 'document_already_exists', '');

/** Empty listDocuments page for target/source recurring when not under test. */
const emptyPage = () => ({ total: 0, documents: [] });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('copyMasterDataToFiscalYear — 409 idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts a supplier as copied when createDocument returns 409', async () => {
    // Target: existing suppliers/apartments/recurring; then source lists
    mockListDocuments
      .mockResolvedValueOnce(emptyPage())  // existingSuppliers (target)
      .mockResolvedValueOnce(emptyPage())  // existingApartments (target)
      .mockResolvedValueOnce(emptyPage())  // existingRecurring (target)
      .mockResolvedValueOnce({ total: 1, documents: [makeSupplier()] }) // sourceSuppliers
      .mockResolvedValueOnce(emptyPage()) // sourceApartments
      .mockResolvedValueOnce(emptyPage()); // sourceRecurring

    mockCreateDocument.mockRejectedValueOnce(make409());

    const onProgress = vi.fn();
    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy', onProgress);

    expect(result.suppliers).toBe(1);
    expect(result.apartments).toBe(0);
    expect(result.recurringExpenses).toBe(0);

    expect(onProgress).toHaveBeenCalledWith('Proveedores', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Proveedores', 1, 1);
  });

  it('counts an apartment as copied when createDocument returns 409', async () => {
    mockListDocuments
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce({ total: 1, documents: [makeApartment()] })
      .mockResolvedValueOnce(emptyPage());

    mockCreateDocument.mockRejectedValueOnce(make409());

    const onProgress = vi.fn();
    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy', onProgress);

    expect(result.apartments).toBe(1);
    expect(result.suppliers).toBe(0);
    expect(result.recurringExpenses).toBe(0);

    expect(onProgress).toHaveBeenCalledWith('Apartamentos', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Apartamentos', 1, 1);
  });

  it('copies recurring expenses remapping apartmentId to the target fiscal year id', async () => {
    mockListDocuments
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce({ total: 1, documents: [makeRecurring('src-recurring-1', 'src-apartment-1')] });

    mockCreateDocument.mockResolvedValueOnce({ $id: 'new-recurring' });

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    expect(result.recurringExpenses).toBe(1);
    expect(mockCreateDocument).toHaveBeenCalledTimes(1);

    const [, , docId, payload] = mockCreateDocument.mock.calls[0];
    expect(docId).toBe(
      await buildMasterDataCopyDocumentId('recurringExpenses', 'target-fy', 'src-recurring-1')
    );
    expect(payload.fiscalYearId).toBe('target-fy');
    expect(payload.apartmentId).toBe(
      await buildMasterDataCopyDocumentId('apartments', 'target-fy', 'src-apartment-1')
    );
  });

  it('returns counts { suppliers: 0, apartments: 0, recurringExpenses: 0 } when target already has all copied master data', async () => {
    const existingSupplierId = await buildMasterDataCopyDocumentId('suppliers', 'target-fy', 'src-supplier-1');
    const existingApartmentId = await buildMasterDataCopyDocumentId('apartments', 'target-fy', 'src-apartment-1');
    const existingRecurringId = await buildMasterDataCopyDocumentId('recurringExpenses', 'target-fy', 'src-recurring-1');

    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeSupplier('src-supplier-1'), $id: existingSupplierId }] })
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeApartment('src-apartment-1'), $id: existingApartmentId }] })
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeRecurring('src-recurring-1'), $id: existingRecurringId }] })
      .mockResolvedValueOnce({ total: 1, documents: [makeSupplier('src-supplier-1')] })
      .mockResolvedValueOnce({ total: 1, documents: [makeApartment('src-apartment-1')] })
      .mockResolvedValueOnce({ total: 1, documents: [makeRecurring('src-recurring-1')] });

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    expect(result.suppliers).toBe(0);
    expect(result.apartments).toBe(0);
    expect(result.recurringExpenses).toBe(0);
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('copies missing suppliers when the target fiscal year already contains a partial previous copy', async () => {
    const existingSupplierId = await buildMasterDataCopyDocumentId('suppliers', 'target-fy', 'src-supplier-1');

    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeSupplier('src-supplier-1'), $id: existingSupplierId }] })
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce({ total: 2, documents: [makeSupplier('src-supplier-1'), makeSupplier('src-supplier-2')] })
      .mockResolvedValueOnce(emptyPage())
      .mockResolvedValueOnce(emptyPage());

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    expect(result.suppliers).toBe(1);
    expect(result.apartments).toBe(0);
    expect(result.recurringExpenses).toBe(0);
    expect(mockCreateDocument).toHaveBeenCalledTimes(1);
    expect(mockCreateDocument.mock.calls[0][2]).toBe(
      await buildMasterDataCopyDocumentId('suppliers', 'target-fy', 'src-supplier-2')
    );
  });

  it('does not count a supplier when createDocument throws a non-409 error on all attempts', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: Parameters<typeof setTimeout>[0]) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    try {
      mockListDocuments
        .mockResolvedValueOnce(emptyPage())
        .mockResolvedValueOnce(emptyPage())
        .mockResolvedValueOnce(emptyPage())
        .mockResolvedValueOnce({ total: 1, documents: [makeSupplier()] })
        .mockResolvedValueOnce(emptyPage())
        .mockResolvedValueOnce(emptyPage());

      mockCreateDocument.mockRejectedValue(
        new AppwriteException('Internal Server Error', 500, 'general_unknown', '')
      );

      const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

      expect(result.suppliers).toBe(0);
      expect(result.apartments).toBe(0);
      expect(result.recurringExpenses).toBe(0);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 2000);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 4000);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 8000);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
