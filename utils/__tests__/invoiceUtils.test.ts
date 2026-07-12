import { describe, it, expect } from 'vitest';
import { buildEntryFromInvoice } from '../invoiceUtils';
import type { Invoice } from '../../types';

/** Minimal valid Invoice factory */
const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-001',
  number: 'F-001',
  date: '2025-07-01',
  issuerName: 'Proveedor SL',
  issuerNif: 'B12345678',
  baseAmount: 0,
  vatRate: 0,
  vatAmount: 0,
  totalAmount: 1000,
  type: 'EXPENSE',
  status: 'PENDING',
  history: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// EXPENSE — PENDING (deuda con proveedor)
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — EXPENSE PENDING', () => {
  const inv = makeInvoice({ type: 'EXPENSE', status: 'PENDING', totalAmount: 500 });
  const entry = buildEntryFromInvoice(inv);

  it('produces exactly 2 lines', () => {
    expect(entry.lines).toHaveLength(2);
  });

  it('line 0 is DEBIT on the 6xx expense account', () => {
    expect(entry.lines[0].accountCode).toMatch(/^6/);
    expect(entry.lines[0].debit).toBe(500);
    expect(entry.lines[0].credit).toBe(0);
  });

  it('line 1 is CREDIT on account 400 (Proveedores)', () => {
    expect(entry.lines[1].accountCode).toBe('400');
    expect(entry.lines[1].debit).toBe(0);
    expect(entry.lines[1].credit).toBe(500);
  });

  it('entry is balanced (totalDebit === totalCredit)', () => {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it('sets invoiceId', () => {
    expect(entry.invoiceId).toBe(inv.id);
  });
});

// ---------------------------------------------------------------------------
// EXPENSE — PROCESSED (also uses 400 until fully paid)
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — EXPENSE PROCESSED', () => {
  const inv = makeInvoice({ type: 'EXPENSE', status: 'PROCESSED', totalAmount: 200 });
  const entry = buildEntryFromInvoice(inv);

  it('counterpart is 400 for PROCESSED status', () => {
    expect(entry.lines[1].accountCode).toBe('400');
  });
});

// ---------------------------------------------------------------------------
// EXPENSE — PAID (pago directo contra banco)
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — EXPENSE PAID', () => {
  const inv = makeInvoice({ type: 'EXPENSE', status: 'PAID', totalAmount: 750 });
  const entry = buildEntryFromInvoice(inv);

  it('produces exactly 2 lines', () => {
    expect(entry.lines).toHaveLength(2);
  });

  it('line 0 is DEBIT on the 6xx expense account', () => {
    expect(entry.lines[0].accountCode).toMatch(/^6/);
    expect(entry.lines[0].debit).toBe(750);
    expect(entry.lines[0].credit).toBe(0);
  });

  it('line 1 is CREDIT on account 572 (Bancos)', () => {
    expect(entry.lines[1].accountCode).toBe('572');
    expect(entry.lines[1].debit).toBe(0);
    expect(entry.lines[1].credit).toBe(750);
  });

  it('entry is balanced', () => {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });
});

// ---------------------------------------------------------------------------
// INCOME — PENDING
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — INCOME PENDING', () => {
  const inv = makeInvoice({ type: 'INCOME', status: 'PENDING', totalAmount: 1200 });
  const entry = buildEntryFromInvoice(inv);

  it('produces exactly 2 lines', () => {
    expect(entry.lines).toHaveLength(2);
  });

  it('line 0 is DEBIT on account 430 (Clientes)', () => {
    expect(entry.lines[0].accountCode).toBe('430');
    expect(entry.lines[0].debit).toBe(1200);
    expect(entry.lines[0].credit).toBe(0);
  });

  it('line 1 is CREDIT on the 7xx income account', () => {
    expect(entry.lines[1].accountCode).toMatch(/^7/);
    expect(entry.lines[1].debit).toBe(0);
    expect(entry.lines[1].credit).toBe(1200);
  });

  it('entry is balanced', () => {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });
});

// ---------------------------------------------------------------------------
// INCOME — PAID
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — INCOME PAID', () => {
  const inv = makeInvoice({ type: 'INCOME', status: 'PAID', totalAmount: 300 });
  const entry = buildEntryFromInvoice(inv);

  it('line 0 is DEBIT on account 572 (Bancos)', () => {
    expect(entry.lines[0].accountCode).toBe('572');
    expect(entry.lines[0].debit).toBe(300);
  });

  it('line 1 is CREDIT on 7xx income account', () => {
    expect(entry.lines[1].accountCode).toMatch(/^7/);
    expect(entry.lines[1].credit).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// INCOME — PROCESSED
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — INCOME PROCESSED', () => {
  const inv = makeInvoice({ type: 'INCOME', status: 'PROCESSED', totalAmount: 450 });
  const entry = buildEntryFromInvoice(inv);

  it('line 0 is DEBIT on account 430 (Clientes)', () => {
    expect(entry.lines[0].accountCode).toBe('430');
    expect(entry.lines[0].debit).toBe(450);
  });

  it('line 1 is CREDIT on 7xx income account', () => {
    expect(entry.lines[1].accountCode).toMatch(/^7/);
    expect(entry.lines[1].credit).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — category resolution', () => {
  it('uses category code when provided as "<code> - <name>"', () => {
    const inv = makeInvoice({ type: 'EXPENSE', category: '621 - Arrendamientos', totalAmount: 400 });
    const entry = buildEntryFromInvoice(inv);
    expect(entry.lines[0].accountCode).toBe('621');
    expect(entry.lines[0].accountName).toBe('Arrendamientos');
  });

  it('uses code-only category', () => {
    const inv = makeInvoice({ type: 'EXPENSE', category: '628', totalAmount: 100 });
    const entry = buildEntryFromInvoice(inv);
    expect(entry.lines[0].accountCode).toBe('628');
    expect(entry.lines[0].accountName).toBe('628');
  });

  it('falls back to 600 for EXPENSE without category', () => {
    const inv = makeInvoice({ type: 'EXPENSE', totalAmount: 50 });
    const entry = buildEntryFromInvoice(inv);
    expect(entry.lines[0].accountCode).toBe('600');
  });

  it('falls back to 700 for INCOME without category', () => {
    const inv = makeInvoice({ type: 'INCOME', totalAmount: 50 });
    const entry = buildEntryFromInvoice(inv);
    expect(entry.lines[1].accountCode).toBe('700');
  });
});

// ---------------------------------------------------------------------------
// Links propagated to entry
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — link propagation', () => {
  const inv = makeInvoice({
    supplierId: 'sup-42',
    apartmentId: 'apt-7',
    fiscalYearId: 'fy-2025',
  });
  const entry = buildEntryFromInvoice(inv);

  it('copies invoiceId', () => expect(entry.invoiceId).toBe('inv-001'));
  it('copies supplierId', () => expect(entry.supplierId).toBe('sup-42'));
  it('copies apartmentId', () => expect(entry.apartmentId).toBe('apt-7'));
  it('copies fiscalYearId', () => expect(entry.fiscalYearId).toBe('fy-2025'));
});

// ---------------------------------------------------------------------------
// Author propagation
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — author', () => {
  it('uses author when invoice has no audit fields', () => {
    const inv = makeInvoice();
    const entry = buildEntryFromInvoice(inv, { userId: 'u-1', userName: 'Ana' });
    expect(entry.createdBy).toBe('u-1');
    expect(entry.createdByName).toBe('Ana');
  });

  it('prefers invoice audit fields over author', () => {
    const inv = makeInvoice({ createdBy: 'u-owner', createdByName: 'Owner' });
    const entry = buildEntryFromInvoice(inv, { userId: 'u-1', userName: 'Ana' });
    expect(entry.createdBy).toBe('u-owner');
    expect(entry.createdByName).toBe('Owner');
  });
});

// ---------------------------------------------------------------------------
// Category resolution — edge cases
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — category edge cases', () => {
  it('handles multi-hyphen category names like "621 - Foo - Bar - Baz"', () => {
    const inv = makeInvoice({ type: 'EXPENSE', category: '621 - Foo - Bar - Baz' });
    const entry = buildEntryFromInvoice(inv);
    expect(entry.lines[0].accountCode).toBe('621');
    expect(entry.lines[0].accountName).toBe('Foo - Bar - Baz');
  });
});

// ---------------------------------------------------------------------------
// Invalid totalAmount handling
// ---------------------------------------------------------------------------
describe('buildEntryFromInvoice — invalid totalAmount', () => {
  it('uses 0 when totalAmount is NaN', () => {
    const inv = makeInvoice({ totalAmount: NaN });
    const entry = buildEntryFromInvoice(inv);
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(entry.lines[0].debit).toBe(0);
    expect(entry.lines[1].credit).toBe(0);
    expect(totalDebit).toBe(totalCredit);
  });

  it('uses 0 when totalAmount is Infinity', () => {
    const inv = makeInvoice({ totalAmount: Infinity });
    const entry = buildEntryFromInvoice(inv);
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(entry.lines[0].debit).toBe(0);
    expect(entry.lines[1].credit).toBe(0);
    expect(totalDebit).toBe(0);
    expect(totalCredit).toBe(0);
  });

  it('produces a balanced (zero) entry when totalAmount is 0', () => {
    const inv = makeInvoice({ totalAmount: 0 });
    const entry = buildEntryFromInvoice(inv);
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(0);
    expect(totalCredit).toBe(0);
  });
});
describe('buildEntryFromInvoice — totalAmount only', () => {
  it('uses totalAmount regardless of baseAmount/vatAmount', () => {
    const inv = makeInvoice({ totalAmount: 121, baseAmount: 100, vatAmount: 21 });
    const entry = buildEntryFromInvoice(inv);
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(121);
    expect(totalCredit).toBe(121);
  });
});

describe('buildEntryFromInvoice — IRPF simplified invariants', () => {
  it.each([
    { type: 'EXPENSE' as const, status: 'PENDING' as const, expectedCounterpart: '400' },
    { type: 'EXPENSE' as const, status: 'PROCESSED' as const, expectedCounterpart: '400' },
    { type: 'EXPENSE' as const, status: 'PAID' as const, expectedCounterpart: '572' },
    { type: 'INCOME' as const, status: 'PENDING' as const, expectedCounterpart: '430' },
    { type: 'INCOME' as const, status: 'PROCESSED' as const, expectedCounterpart: '430' },
    { type: 'INCOME' as const, status: 'PAID' as const, expectedCounterpart: '572' },
  ])('keeps entry balanced and maps counterpart account for $type/$status', ({ type, status, expectedCounterpart }) => {
    const inv = makeInvoice({ type, status, totalAmount: 333.33 });
    const entry = buildEntryFromInvoice(inv);
    const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
    const counterpartLine = entry.lines.find((line) => line.accountCode === expectedCounterpart);

    expect(totalDebit).toBe(totalCredit);
    expect(counterpartLine).toBeDefined();
    expect(entry.lines.some((line) => line.accountCode.startsWith('472'))).toBe(false);
    expect(entry.lines.some((line) => line.accountCode.startsWith('477'))).toBe(false);
  });
});
