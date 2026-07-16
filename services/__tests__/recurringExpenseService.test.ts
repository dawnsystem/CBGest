/**
 * @fileoverview Tests BUG-FY-003 — filtro por ejercicio en gastos recurrentes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockListDocuments } = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
}));

vi.mock('../../lib/appwrite/client', () => ({
  databases: {
    listDocuments: mockListDocuments,
  },
  config: {
    databaseId: 'test-db',
    collections: {
      recurringExpenses: 'recurring-col',
    },
  },
}));

vi.mock('appwrite');

import { getRecurringExpenses } from '../appwrite/recurringExpenseService';

describe('getRecurringExpenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filtra por fiscalYearId cuando se consulta desde un ejercicio activo', async () => {
    mockListDocuments.mockResolvedValueOnce({
      total: 1,
      documents: [
        {
          $id: 'rec-1',
          name: 'Comunidad',
          estimatedAmount: 100,
          frequency: 'MONTHLY',
          isDeductible: true,
          isActive: true,
          fiscalYearId: 'fy-2026',
        },
      ],
    });

    const expenses = await getRecurringExpenses('fy-2026');

    expect(expenses).toHaveLength(1);
    expect(mockListDocuments).toHaveBeenCalledWith(
      'test-db',
      'recurring-col',
      expect.arrayContaining([
        'orderAsc("name")',
        'limit(500)',
        'equal("fiscalYearId", "fy-2026")',
      ])
    );
  });
});
