import { describe, expect, it } from 'vitest';
import { buildEntryFromInvoice } from '../invoiceUtils';
import { Invoice } from '../../types';

const baseInvoice: Invoice = {
  id: 'inv-1',
  number: 'F-001',
  date: '2026-07-10',
  issuerName: 'Proveedor',
  issuerNif: 'B12345678',
  baseAmount: 120,
  vatRate: 0,
  vatAmount: 0,
  totalAmount: 120,
  type: 'EXPENSE',
  status: 'PENDING',
  history: []
};

describe('buildEntryFromInvoice', () => {
  it('creates expense invoice entry with supplier payable counterpart', () => {
    const entry = buildEntryFromInvoice(baseInvoice);

    expect(entry.lines).toEqual([
      { accountCode: '600', accountName: 'Compras de mercaderías', debit: 120, credit: 0 },
      { accountCode: '400', accountName: 'Proveedores', debit: 0, credit: 120 }
    ]);
  });

  it('creates income invoice entry with customer receivable counterpart', () => {
    const entry = buildEntryFromInvoice({
      ...baseInvoice,
      id: 'inv-2',
      type: 'INCOME',
      issuerName: 'Cliente'
    });

    expect(entry.lines).toEqual([
      { accountCode: '700', accountName: 'Ventas de mercaderías', debit: 0, credit: 120 },
      { accountCode: '430', accountName: 'Clientes', debit: 120, credit: 0 }
    ]);
  });

  it('guards invalid totals and keeps category-only account names consistent', () => {
    const entry = buildEntryFromInvoice({
      ...baseInvoice,
      category: '628',
      totalAmount: Number.NaN,
      fiscalYearId: 'fy-2026'
    });

    expect(entry.lines).toEqual([
      { accountCode: '628', accountName: '628', debit: 0, credit: 0 },
      { accountCode: '400', accountName: 'Proveedores', debit: 0, credit: 0 }
    ]);
    expect(entry.fiscalYearId).toBe('fy-2026');
  });
});
