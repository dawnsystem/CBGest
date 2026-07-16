/**
 * @fileoverview Tests CTB-003 — paginación cursor en getEntries / getTransactions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListDocuments } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
}));

vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
  config: {
    databaseId: 'test-db',
    collections: {
      entries: 'entries-col',
      transactions: 'transactions-col',
    },
  },
}));

vi.mock('appwrite');

import { getEntries } from '../appwrite/entryService';
import { getTransactions } from '../appwrite/transactionService';
import { APPWRITE_LIST_PAGE_SIZE } from '../appwrite/infrastructure';

const makeDocs = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    $id: `${prefix}-${i}`,
    date: '2026-01-01',
    accountCode: '572',
    accountName: 'Banco',
    debit: 0,
    credit: 0,
  }));

describe('CTB-003 — paginación getEntries / getTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getEntries pagina con cursor cuando la primera página está llena', async () => {
    const page1 = makeDocs(APPWRITE_LIST_PAGE_SIZE, 'e');
    const page2 = makeDocs(3, 'e2');

    mockListDocuments
      .mockResolvedValueOnce({ total: APPWRITE_LIST_PAGE_SIZE + 3, documents: page1 })
      .mockResolvedValueOnce({ total: APPWRITE_LIST_PAGE_SIZE + 3, documents: page2 });

    const entries = await getEntries('fy-1');

    expect(entries).toHaveLength(APPWRITE_LIST_PAGE_SIZE + 3);
    expect(mockListDocuments).toHaveBeenCalledTimes(2);
    // Segunda llamada incluye cursorAfter del último de la página 1
    const secondQueries = mockListDocuments.mock.calls[1][2] as string[];
    expect(secondQueries.some(q => String(q).includes(`cursorAfter("${page1[page1.length - 1].$id}")`))).toBe(true);
  });

  it('getTransactions pagina con cursor cuando la primera página está llena', async () => {
    const page1 = makeDocs(APPWRITE_LIST_PAGE_SIZE, 't');
    const page2 = makeDocs(1, 't2');

    mockListDocuments
      .mockResolvedValueOnce({ total: APPWRITE_LIST_PAGE_SIZE + 1, documents: page1 })
      .mockResolvedValueOnce({ total: APPWRITE_LIST_PAGE_SIZE + 1, documents: page2 });

    const txs = await getTransactions();

    expect(txs).toHaveLength(APPWRITE_LIST_PAGE_SIZE + 1);
    expect(mockListDocuments).toHaveBeenCalledTimes(2);
  });

  it('getEntries no pagina si hay menos del límite', async () => {
    mockListDocuments.mockResolvedValueOnce({
      total: 2,
      documents: makeDocs(2, 'e'),
    });

    const entries = await getEntries();

    expect(entries).toHaveLength(2);
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });
});
