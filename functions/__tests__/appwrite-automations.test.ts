import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  createFile: vi.fn(),
  idUnique: vi.fn(() => 'unique-id'),
}));

vi.mock('node-appwrite', () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  },
  Databases: class {
    listDocuments(...args: unknown[]) {
      return mockState.listDocuments(...args);
    }
    updateDocument(...args: unknown[]) {
      return mockState.updateDocument(...args);
    }
    createDocument(...args: unknown[]) {
      return mockState.createDocument(...args);
    }
    deleteDocument(...args: unknown[]) {
      return mockState.deleteDocument(...args);
    }
  },
  Storage: class {
    createFile(...args: unknown[]) {
      return mockState.createFile(...args);
    }
  },
  Query: {
    equal: (field: string, value: unknown) => ({ op: 'equal', field, value }),
    greaterThanEqual: (field: string, value: unknown) => ({ op: 'gte', field, value }),
    lessThanEqual: (field: string, value: unknown) => ({ op: 'lte', field, value }),
    greaterThan: (field: string, value: unknown) => ({ op: 'gt', field, value }),
    lessThan: (field: string, value: unknown) => ({ op: 'lt', field, value }),
    limit: (value: number) => ({ op: 'limit', value }),
    offset: (value: number) => ({ op: 'offset', value }),
    orderAsc: (field: string) => ({ op: 'orderAsc', field }),
    orderDesc: (field: string) => ({ op: 'orderDesc', field }),
    or: (queries: unknown[]) => ({ op: 'or', queries }),
  },
  ID: {
    unique: () => mockState.idUnique(),
  },
}));

const makeRes = () => ({
  json: vi.fn((payload: unknown, status?: number) => ({ payload, status })),
});

describe('Appwrite automation functions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.createDocument.mockResolvedValue({});
    mockState.updateDocument.mockResolvedValue({});
    mockState.deleteDocument.mockResolvedValue({});
    mockState.createFile.mockResolvedValue({ $id: 'file-1' });
  });

  it('auto-reconcile updates current transaction fields and invoice status', async () => {
    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'inv-1' }] });

    const { default: autoReconcile } = await import('../auto-reconcile/src/main.js');
    const res = makeRes();

    await autoReconcile({
      req: {
        body: {
          $id: 'tx-1',
          amount: -121,
          concept: 'Factura luz',
          status: 'PENDING',
          fiscalYearId: 'fy-2026',
        }
      },
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(mockState.listDocuments).toHaveBeenCalledWith(
      expect.any(String),
      'invoices',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'type', value: 'EXPENSE' }),
        expect.objectContaining({ op: 'equal', field: 'status', value: 'PENDING' }),
        expect.objectContaining({ op: 'equal', field: 'fiscalYearId', value: 'fy-2026' }),
      ])
    );
    expect(mockState.updateDocument).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'transactions',
      'tx-1',
      { reconciledWithInvoiceId: 'inv-1', status: 'MATCHED' }
    );
    expect(mockState.updateDocument).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'invoices',
      'inv-1',
      { status: 'PAID' }
    );
  });

  it('weekly-summary uses current enums and transactions collection', async () => {
    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [{ totalAmount: '1000' }] })
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({
        documents: [
          { type: 'EXPENSE', totalAmount: '200' },
          { type: 'INCOME', totalAmount: '999' },
        ]
      })
      .mockResolvedValueOnce({ documents: [{ totalAmount: '50' }] })
      .mockResolvedValueOnce({ documents: [{ $id: 'tx-1' }] })
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({ documents: [{ $id: 'apt-1' }, { $id: 'apt-2' }] });

    const { default: weeklySummary } = await import('../weekly-summary/src/main.js');
    const res = makeRes();

    await weeklySummary({
      req: {},
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      5,
      expect.any(String),
      'transactions',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'status', value: 'PENDING' }),
      ])
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      summary: expect.objectContaining({
        expenses: expect.objectContaining({
          newInvoices: 1,
          totalAmount: 200,
        }),
      }),
    }));
  });

  it('calculate-profitability filters by active fiscal year and ignores pending invoices', async () => {
    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'fy-2026', year: 2026, status: 'OPEN' }] })
      .mockResolvedValueOnce({ documents: [{ $id: 'apt-1', name: 'Apartamento 1' }] })
      .mockResolvedValueOnce({ documents: [{ totalAmount: '1000', nights: '10' }] })
      .mockResolvedValueOnce({
        documents: [
          { totalAmount: '200', status: 'PROCESSED', isDeductible: true },
          { totalAmount: '50', status: 'PENDING', isDeductible: true },
        ]
      });

    const { default: calculateProfitability } = await import('../calculate-profitability/src/main.js');
    const res = makeRes();

    await calculateProfitability({
      req: {},
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      4,
      expect.any(String),
      'invoices',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'fiscalYearId', value: 'fy-2026' }),
        expect.objectContaining({ op: 'equal', field: 'type', value: 'EXPENSE' }),
      ])
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      fiscalYearId: 'fy-2026',
      apartments: [
        expect.objectContaining({
          metrics: expect.objectContaining({
            expenses: 200,
            netProfit: 800,
          }),
          irpf: expect.objectContaining({
            rendimientoNeto: 800,
            reduccion: 0,
            rendimientoReducido: 800,
          }),
        })
      ],
    }));
  });

  it('prepare-modelo-184 reads settings partners and active fiscal year', async () => {
    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'fy-2025', year: 2025, status: 'OPEN' }] })
      .mockResolvedValueOnce({
        documents: [{
          cbName: 'CB Demo',
          nif: 'J12345678',
          partners: JSON.stringify([
            { name: 'Ana', nif: '111', participation: 60 },
            { name: 'Luis', nif: '222', participation: 40 },
          ]),
        }]
      })
      .mockResolvedValueOnce({ documents: [{ apartmentName: 'A1', totalAmount: '1000', nights: '5' }] })
      .mockResolvedValueOnce({
        documents: [
          { category: 'Suministros', totalAmount: '300', status: 'PAID', isDeductible: true },
          { category: 'Suministros', totalAmount: '50', status: 'PENDING', isDeductible: true },
        ]
      });

    const { default: prepareModelo184 } = await import('../prepare-modelo-184/src/main.js');
    const res = makeRes();

    await prepareModelo184({
      req: {},
      res,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      4,
      expect.any(String),
      'invoices',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'fiscalYearId', value: 'fy-2025' }),
        expect.objectContaining({ op: 'equal', field: 'type', value: 'EXPENSE' }),
      ])
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      modelo184: expect.objectContaining({
        fiscalYear: 2025,
        declarante: expect.objectContaining({
          denominacion: 'CB Demo',
          nif: 'J12345678',
        }),
        resumen: expect.objectContaining({
          gastosDeducibles: 300,
          rendimientoNeto: 700,
        }),
        atribucionRendimientos: [
          expect.objectContaining({ participation: 60, rendimientoAtribuido: 420 }),
          expect.objectContaining({ participation: 40, rendimientoAtribuido: 280 }),
        ],
      }),
    }));
  });

  it('keeps apartment profitability aligned with Modelo 184 declarable base in single-apartment scenarios', async () => {
    mockState.listDocuments
      // calculate-profitability
      .mockResolvedValueOnce({ documents: [{ $id: 'fy-2026', year: 2026, status: 'OPEN' }] })
      .mockResolvedValueOnce({ documents: [{ $id: 'apt-1', name: 'Apartamento 1' }] })
      .mockResolvedValueOnce({ documents: [{ apartmentName: 'Apartamento 1', totalAmount: '1000', nights: '5' }] })
      .mockResolvedValueOnce({
        documents: [{ totalAmount: '200', status: 'PAID', isDeductible: true }]
      })
      // prepare-modelo-184
      .mockResolvedValueOnce({ documents: [{ $id: 'fy-2026', year: 2026, status: 'OPEN' }] })
      .mockResolvedValueOnce({
        documents: [{
          cbName: 'CB Demo',
          nif: 'J12345678',
          partners: JSON.stringify([{ name: 'Ana', nif: '111', participation: 100 }]),
        }]
      })
      .mockResolvedValueOnce({ documents: [{ apartmentName: 'Apartamento 1', totalAmount: '1000', nights: '5' }] })
      .mockResolvedValueOnce({
        documents: [{ category: 'Suministros', totalAmount: '200', status: 'PAID', isDeductible: true }]
      });

    const { default: calculateProfitability } = await import('../calculate-profitability/src/main.js');
    const { default: prepareModelo184 } = await import('../prepare-modelo-184/src/main.js');
    const profitabilityRes = makeRes();
    const modelo184Res = makeRes();

    await calculateProfitability({
      req: {},
      res: profitabilityRes,
      log: vi.fn(),
      error: vi.fn(),
    });

    await prepareModelo184({
      req: {},
      res: modelo184Res,
      log: vi.fn(),
      error: vi.fn(),
    });

    const profitabilityPayload = profitabilityRes.json.mock.calls[0][0] as {
      apartments: Array<{ irpf: { rendimientoNeto: number } }>;
    };
    const modelo184Payload = modelo184Res.json.mock.calls[0][0] as {
      modelo184: { resumen: { rendimientoNeto: number } };
    };

    expect(profitabilityPayload.apartments[0].irpf.rendimientoNeto).toBe(800);
    expect(modelo184Payload.modelo184.resumen.rendimientoNeto).toBe(800);
  });

  it('maintenance checks the real "entries" collection, not the legacy "accountingEntries" id', async () => {
    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [] }) // old notifications
      .mockResolvedValueOnce({ documents: [{ $id: 'inv-1' }] }) // invoices
      .mockResolvedValueOnce({ documents: [{ $id: 'entry-1', invoiceId: 'missing-invoice' }] }); // entries

    const { default: maintenance } = await import('../maintenance/src/main.js');
    const res = makeRes();

    await maintenance({ req: {}, res, log: vi.fn(), error: vi.fn() });

    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      'entries',
      expect.anything()
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      integrity: expect.objectContaining({ invoices: 1, orphanedEntries: 1 }),
    }));
  });

  it('cleanup-uploads queries COMPLETED/ERROR enums (not lowercase legacy values)', async () => {
    mockState.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'up-1' }, { $id: 'up-2' }],
    });

    const { default: cleanupUploads } = await import('../cleanup-uploads/src/main.js');
    const res = makeRes();

    await cleanupUploads({ req: {}, res, log: vi.fn(), error: vi.fn() });

    expect(mockState.listDocuments).toHaveBeenCalledWith(
      expect.any(String),
      'uploads',
      expect.arrayContaining([
        expect.objectContaining({
          // Query.or wraps equal(COMPLETED) + equal(ERROR)
        }),
      ])
    );

    const queries = mockState.listDocuments.mock.calls[0][2] as unknown[];
    const serialized = JSON.stringify(queries);
    expect(serialized).toContain('COMPLETED');
    expect(serialized).toContain('ERROR');
    expect(serialized).not.toContain('"completed"');
    expect(serialized).not.toContain('"error"');
    expect(mockState.deleteDocument).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      found: 2,
      deleted: 2,
    }));
  });

  it('detect-recurring filters transactions by active OPEN fiscal year and creates valid recurring_expenses documents', async () => {
    const baseDate = new Date('2026-01-05');
    const monthlyDates = [0, 1, 2, 3].map(i => {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      return d.toISOString().split('T')[0];
    });

    mockState.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'fy-2026', year: 2026, status: 'OPEN' }] })
      .mockResolvedValueOnce({
        documents: monthlyDates.map(date => ({
          $id: `tx-${date}`,
          date,
          amount: '-45.00',
          concept: 'Cuota Comunidad Propietarios 123',
          fiscalYearId: 'fy-2026',
        })),
      })
      .mockResolvedValueOnce({ documents: [] }); // existing recurring_expenses

    const { default: detectRecurring } = await import('../detect-recurring/src/main.js');
    const res = makeRes();

    await detectRecurring({ req: {}, res, log: vi.fn(), error: vi.fn() });

    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'fiscal_years',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'status', value: 'OPEN' }),
      ])
    );
    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'transactions',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'fiscalYearId', value: 'fy-2026' }),
      ])
    );
    expect(mockState.listDocuments).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      'recurring_expenses',
      expect.arrayContaining([
        expect.objectContaining({ op: 'equal', field: 'fiscalYearId', value: 'fy-2026' }),
      ])
    );
    expect(mockState.createDocument).toHaveBeenCalledTimes(1);
    const [, collectionId, , payload] = mockState.createDocument.mock.calls[0];
    expect(collectionId).toBe('recurring_expenses');
    // `id` and `createdAt` are not attributes of recurring_expenses ($id/$createdAt
    // are managed by Appwrite) — sending them would throw "Unknown attribute".
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('createdAt');
    // `frequency` must match the enum defined on the collection.
    expect(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).toContain(payload.frequency);
    expect(payload.fiscalYearId).toBe('fy-2026');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      fiscalYearId: 'fy-2026',
    }));
  });

  it('detect-recurring skips when there is no OPEN fiscal year', async () => {
    mockState.listDocuments.mockResolvedValueOnce({ documents: [] });

    const { default: detectRecurring } = await import('../detect-recurring/src/main.js');
    const res = makeRes();

    await detectRecurring({ req: {}, res, log: vi.fn(), error: vi.fn() });

    expect(mockState.createDocument).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      skipped: true,
      reason: 'no-active-fiscal-year',
    }));
  });

  it('backup-data backs up the real "entries"/"transactions" collections, not legacy ids', async () => {
    mockState.listDocuments.mockResolvedValue({ documents: [] });

    const { default: backupData } = await import('../backup-data/src/main.js');
    const res = makeRes();

    await backupData({ req: {}, res, log: vi.fn(), error: vi.fn() });

    const backedUpCollectionIds = mockState.listDocuments.mock.calls.map(call => call[1]);
    expect(backedUpCollectionIds).toContain('entries');
    expect(backedUpCollectionIds).toContain('transactions');
    expect(backedUpCollectionIds).not.toContain('accountingEntries');
    expect(backedUpCollectionIds).not.toContain('bankTransactions');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
