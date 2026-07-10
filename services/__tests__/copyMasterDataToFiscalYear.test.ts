/**
 * @fileoverview Tests for copyMasterDataToFiscalYear — idempotency under 409 responses.
 *
 * Scenario covered:
 *   1. First createDocument call succeeds silently (document created in Appwrite)
 *      but the response is lost (e.g. network timeout) so withRetry triggers.
 *   2. The retry uses the same pre-generated document ID, so Appwrite returns 409.
 *   3. The 409 must be treated as a success: counts and onProgress must be updated
 *      just as if the first attempt had returned normally.
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('copyMasterDataToFiscalYear — 409 idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts a supplier as copied when createDocument returns 409 on retry', async () => {
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

  it('counts an apartment as copied when createDocument returns 409 on retry', async () => {
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

  it('returns counts { suppliers: 0, apartments: 0 } when target already has data', async () => {
    // Target already has existing suppliers and apartments — copy is skipped.
    mockListDocuments
      .mockResolvedValueOnce({ total: 2, documents: [makeSupplier('e1'), makeSupplier('e2')] }) // existingSuppliers
      .mockResolvedValueOnce({ total: 1, documents: [makeApartment('ea1')] });                  // existingApartments

    const result = await databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    // When skipping copy, returned counts should be 0 (nothing was copied).
    expect(result.suppliers).toBe(0);
    expect(result.apartments).toBe(0);

    // createDocument must not have been called.
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('does not count a supplier when createDocument throws a non-409 error on all attempts', async () => {
    vi.useFakeTimers();

    mockListDocuments
      .mockResolvedValueOnce({ total: 0, documents: [] })
      .mockResolvedValueOnce({ total: 0, documents: [] })
      .mockResolvedValueOnce({ total: 1, documents: [makeSupplier()] })
      .mockResolvedValueOnce({ total: 0, documents: [] });

    // Generic 500 error on every attempt — should NOT be treated as success.
    mockCreateDocument.mockRejectedValue(
      new AppwriteException('Internal Server Error', 500, 'general_unknown', '')
    );

    const promise = databaseService.copyMasterDataToFiscalYear('source-fy', 'target-fy');

    // Advance through all retry delays (2s + 4s + 8s).
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();

    expect(result.suppliers).toBe(0);
    expect(result.apartments).toBe(0);
  });
});
