/**
 * @fileoverview Tests para las funciones de eliminación de ejercicios fiscales.
 * Cubre getFiscalYearDependencies, deleteFiscalYear y deleteFiscalYearCascade.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoist mock fns ────────────────────────────────────────────────────────────
const {
  mockListDocuments,
  mockDeleteDocument,
  mockDeleteFile,
} = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
  mockDeleteDocument: vi.fn(),
  mockDeleteFile: vi.fn(),
}));

// ── Mock del cliente Appwrite ─────────────────────────────────────────────────
vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
    deleteDocument: mockDeleteDocument,
  },
  storage: {
    deleteFile: mockDeleteFile,
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

// Appwrite mock general (Query, etc.)
vi.mock('appwrite');

// ── Importar los servicios después de los mocks ───────────────────────────────
import { getFiscalYearDependencies, deleteFiscalYear, deleteFiscalYearCascade } from '../appwrite/fiscalYearService';

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyCollection = (total = 0) => ({ total, documents: [] });

const makeDoc = (id: string, extra: Record<string, unknown> = {}) => ({
  $id: id,
  $collectionId: 'col',
  $databaseId: 'test-db',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  ...extra,
});

// ── getFiscalYearDependencies ─────────────────────────────────────────────────
describe('getFiscalYearDependencies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve ceros cuando todas las colecciones están vacías', async () => {
    mockListDocuments.mockResolvedValue(emptyCollection(0));

    const deps = await getFiscalYearDependencies('fy-001');

    expect(deps.invoices).toBe(0);
    expect(deps.entries).toBe(0);
    expect(deps.transactions).toBe(0);
    expect(deps.reservations).toBe(0);
    expect(deps.suppliers).toBe(0);
    expect(deps.apartments).toBe(0);
    expect(deps.recurringExpenses).toBe(0);
    expect(deps.total).toBe(0);
  });

  it('acumula correctamente los conteos de todas las colecciones', async () => {
    // 7 colecciones en paralelo: invoices, entries, transactions, reservations, suppliers, apartments, recurring
    mockListDocuments
      .mockResolvedValueOnce(emptyCollection(3))   // invoices
      .mockResolvedValueOnce(emptyCollection(5))   // entries
      .mockResolvedValueOnce(emptyCollection(7))   // transactions
      .mockResolvedValueOnce(emptyCollection(2))   // reservations
      .mockResolvedValueOnce(emptyCollection(4))   // suppliers
      .mockResolvedValueOnce(emptyCollection(1))   // apartments
      .mockResolvedValueOnce(emptyCollection(6));  // recurringExpenses

    const deps = await getFiscalYearDependencies('fy-001');

    expect(deps.invoices).toBe(3);
    expect(deps.entries).toBe(5);
    expect(deps.transactions).toBe(7);
    expect(deps.reservations).toBe(2);
    expect(deps.suppliers).toBe(4);
    expect(deps.apartments).toBe(1);
    expect(deps.recurringExpenses).toBe(6);
    expect(deps.total).toBe(28);
  });

  it('propaga el error si falla una consulta', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((cb: () => void) => { cb(); return 0; }) as typeof setTimeout
    );
    try {
      mockListDocuments.mockRejectedValue(new Error('network error'));
      await expect(getFiscalYearDependencies('fy-001')).rejects.toThrow('network error');
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

// ── deleteFiscalYear ──────────────────────────────────────────────────────────
describe('deleteFiscalYear', () => {
  beforeEach(() => vi.clearAllMocks());

  it('llama a deleteDocument con el ID y colección correctos', async () => {
    mockDeleteDocument.mockResolvedValue({});

    await deleteFiscalYear('fy-doc-123');

    expect(mockDeleteDocument).toHaveBeenCalledTimes(1);
    expect(mockDeleteDocument).toHaveBeenCalledWith(
      'test-db',
      'fiscal-years-col',
      'fy-doc-123'
    );
  });

  it('propaga el error si deleteDocument falla', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((cb: () => void) => { cb(); return 0; }) as typeof setTimeout
    );
    try {
      mockDeleteDocument.mockRejectedValue(new Error('delete failed'));
      await expect(deleteFiscalYear('fy-doc-123')).rejects.toThrow('delete failed');
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

// ── deleteFiscalYearCascade ───────────────────────────────────────────────────
describe('deleteFiscalYearCascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteFile.mockResolvedValue({});
    mockDeleteDocument.mockResolvedValue({});
  });

  it('elimina documentos de todas las colecciones y luego el propio ejercicio', async () => {
    // Una factura, un asiento; el resto vacío
    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [makeDoc('inv-1')] }) // invoices
      .mockResolvedValueOnce(emptyCollection(0)) // invoices siguiente página
      .mockResolvedValueOnce({ total: 1, documents: [makeDoc('ent-1')] }) // entries
      .mockResolvedValueOnce(emptyCollection(0)) // entries siguiente página
      .mockResolvedValue(emptyCollection(0)); // resto de colecciones (transactions, reservations, suppliers, apartments)

    await deleteFiscalYearCascade('fy-001');

    // Debe haber eliminado: inv-1, ent-1 + el propio ejercicio
    const deleteCalls = mockDeleteDocument.mock.calls.map(c => c[2] as string);
    expect(deleteCalls).toContain('inv-1');
    expect(deleteCalls).toContain('ent-1');
    expect(deleteCalls).toContain('fy-001');
  });

  it('elimina el archivo adjunto de Storage antes de borrar la factura', async () => {
    mockListDocuments
      .mockResolvedValueOnce({
        total: 1,
        documents: [makeDoc('inv-with-file', { appwriteFileId: 'file-abc' })]
      })
      .mockResolvedValue(emptyCollection(0));

    await deleteFiscalYearCascade('fy-001');

    expect(mockDeleteFile).toHaveBeenCalledWith('test-bucket', 'file-abc');
    expect(mockDeleteDocument).toHaveBeenCalledWith('test-db', 'invoices-col', 'inv-with-file');
  });

  it('continúa con la eliminación aunque falle el borrado de Storage', async () => {
    mockDeleteFile.mockRejectedValue(new Error('storage error'));
    mockListDocuments
      .mockResolvedValueOnce({
        total: 1,
        documents: [makeDoc('inv-1', { appwriteFileId: 'file-xyz' })]
      })
      .mockResolvedValue(emptyCollection(0));

    // No debe lanzar
    await expect(deleteFiscalYearCascade('fy-001')).resolves.toBeUndefined();

    // El documento de factura debe borrarse igualmente
    expect(mockDeleteDocument).toHaveBeenCalledWith('test-db', 'invoices-col', 'inv-1');
  });

  it('no elimina archivos de Storage para facturas sin fileId', async () => {
    mockListDocuments
      .mockResolvedValueOnce({ total: 1, documents: [makeDoc('inv-no-file')] })
      .mockResolvedValue(emptyCollection(0));

    await deleteFiscalYearCascade('fy-001');

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockDeleteDocument).toHaveBeenCalledWith('test-db', 'invoices-col', 'inv-no-file');
  });

  it('invoca el callback onProgress con la fase y el contador', async () => {
    mockListDocuments
      .mockResolvedValueOnce({ total: 2, documents: [makeDoc('inv-1'), makeDoc('inv-2')] })
      .mockResolvedValue(emptyCollection(0));

    const onProgress = vi.fn();
    await deleteFiscalYearCascade('fy-001', onProgress);

    expect(onProgress).toHaveBeenCalledWith('Facturas', 1);
    expect(onProgress).toHaveBeenCalledWith('Facturas', 2);
  });

  it('elimina el documento del ejercicio como última acción', async () => {
    mockListDocuments.mockResolvedValue(emptyCollection(0));

    await deleteFiscalYearCascade('fy-cascade');

    const lastCall = mockDeleteDocument.mock.calls[mockDeleteDocument.mock.calls.length - 1];
    expect(lastCall[1]).toBe('fiscal-years-col');
    expect(lastCall[2]).toBe('fy-cascade');
  });

  it('propaga el error si deleteDocument falla durante la cascada', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((cb: () => void) => { cb(); return 0; }) as typeof setTimeout
    );

    try {
      mockListDocuments
        .mockResolvedValueOnce({ total: 1, documents: [makeDoc('inv-fail')] })
        .mockResolvedValue(emptyCollection(0));
      mockDeleteDocument.mockRejectedValue(new Error('delete error'));

      await expect(deleteFiscalYearCascade('fy-001')).rejects.toThrow('delete error');
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
