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
    },
  },
}));

// We still need the appwrite module mock for Query, ID, AppwriteException, etc.
vi.mock('appwrite');

// ── Import after mocks are set up ────────────────────────────────────────────
import { databaseService } from '../appwriteService';
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

/** Creates a 409 Appwrite exception (document already exists). */
const make409 = () => new AppwriteException('Document with the requested ID already exists.', 409, 'document_already_exists', '');

const buildExpectedCopyDocumentId = async (
  collection: 'suppliers' | 'apartments',
  targetFiscalYearId: string,
  sourceDocumentId: string
) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${collection}:${targetFiscalYearId}:${sourceDocumentId}`)
  );
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const prefix = collection === 'suppliers' ? 'ms' : 'ma';
  return `${prefix}-${hash.slice(0, 33)}`;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('copyMasterDataToFiscalYear — 409 idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts a supplier as copied when createDocument returns 409', async () => {
    // Target fiscal year has no existing suppliers or apartments.
    mockListDocuments
      .mockResolvedValueOnce({ total: 0, documents: [] })  // existingSuppliers (target)
      .mockResolvedValueOnce({ total: 0, documents: [] })  // existingApartments (target)
      .mockResolvedValueOnce({ total: 1, documents: [makeSupplier()] }) // sourceSuppliers
      .mockResolvedValueOnce({ total: 0, documents: [] }); // sourceApartments

    // Supplier createDocument throws 409 (simulate: created but response was lost).
    mockCreateDocument.mockRejectedValueOnce(make409());

    const onProgress = vi.fn();
    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy', onProgress);

    // One supplier must be counted even though createDocument threw 409.
    expect(result.suppliers).toBe(1);
    expect(result.apartments).toBe(0);

    // onProgress must be called for the supplier.
    expect(onProgress).toHaveBeenCalledWith('Proveedores', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Proveedores', 1, 1);
  });

  it('counts an apartment as copied when createDocument returns 409', async () => {
    // Target fiscal year has no existing suppliers or apartments.
    mockListDocuments
      .mockResolvedValueOnce({ total: 0, documents: [] })  // existingSuppliers (target)
      .mockResolvedValueOnce({ total: 0, documents: [] })  // existingApartments (target)
      .mockResolvedValueOnce({ total: 0, documents: [] })  // sourceSuppliers
      .mockResolvedValueOnce({ total: 1, documents: [makeApartment()] }); // sourceApartments

    // Apartment createDocument throws 409.
    mockCreateDocument.mockRejectedValueOnce(make409());

    const onProgress = vi.fn();
    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy', onProgress);

    expect(result.apartments).toBe(1);
    expect(result.suppliers).toBe(0);

    expect(onProgress).toHaveBeenCalledWith('Apartamentos', 0, 1);
    expect(onProgress).toHaveBeenCalledWith('Apartamentos', 1, 1);
  });

  it('returns counts { suppliers: 0, apartments: 0 } when target already has all copied master data', async () => {
    const existingSupplierId = await buildExpectedCopyDocumentId('suppliers', 'target-fy', 'src-supplier-1');
    const existingApartmentId = await buildExpectedCopyDocumentId('apartments', 'target-fy', 'src-apartment-1');

    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeSupplier('src-supplier-1'), $id: existingSupplierId }] })
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeApartment('src-apartment-1'), $id: existingApartmentId }] })
      .mockResolvedValueOnce({ total: 1, documents: [makeSupplier('src-supplier-1')] })
      .mockResolvedValueOnce({ total: 1, documents: [makeApartment('src-apartment-1')] });

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    expect(result.suppliers).toBe(0);
    expect(result.apartments).toBe(0);
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('copies missing suppliers when the target fiscal year already contains a partial previous copy', async () => {
    const existingSupplierId = await buildExpectedCopyDocumentId('suppliers', 'target-fy', 'src-supplier-1');

    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [{ ...makeSupplier('src-supplier-1'), $id: existingSupplierId }] })
      .mockResolvedValueOnce({ total: 0, documents: [] })
      .mockResolvedValueOnce({ total: 2, documents: [makeSupplier('src-supplier-1'), makeSupplier('src-supplier-2')] })
      .mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    expect(result.suppliers).toBe(1);
    expect(result.apartments).toBe(0);
    expect(mockCreateDocument).toHaveBeenCalledTimes(1);
    expect(mockCreateDocument.mock.calls[0][2]).toBe(
      await buildExpectedCopyDocumentId('suppliers', 'target-fy', 'src-supplier-2')
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
        .mockResolvedValueOnce({ total: 0, documents: [] })
        .mockResolvedValueOnce({ total: 0, documents: [] })
        .mockResolvedValueOnce({ total: 1, documents: [makeSupplier()] })
        .mockResolvedValueOnce({ total: 0, documents: [] });

      // Generic 500 error on every attempt — should NOT be treated as success.
      mockCreateDocument.mockRejectedValue(
        new AppwriteException('Internal Server Error', 500, 'general_unknown', '')
      );

      const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

      expect(result.suppliers).toBe(0);
      expect(result.apartments).toBe(0);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
