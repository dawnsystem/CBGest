import { describe, it, expect } from 'vitest';
import { buildEntryFromInvoice, buildClosingEntry } from '../invoiceUtils';
import { Invoice } from '../../types';

const BASE_INVOICE: Invoice = {
  id: 'INV-001',
  number: 'F/2024/001',
  date: '2024-03-15',
  issuerName: 'Proveedor S.L.',
  issuerNif: 'B12345678',
  baseAmount: 1000,
  vatRate: 0,
  vatAmount: 0,
  totalAmount: 1000,
  type: 'EXPENSE',
  status: 'PENDING',
  history: [],
};

const income = (status: Invoice['status']): Invoice => ({
  ...BASE_INVOICE,
  id: 'INV-INC',
  type: 'INCOME',
  status,
});

const expense = (status: Invoice['status']): Invoice => ({
  ...BASE_INVOICE,
  id: 'INV-EXP',
  type: 'EXPENSE',
  status,
});

describe('buildEntryFromInvoice — ALQUILER_EXENTO (IRPF Simplificado)', () => {
  it('INCOME PENDING: DR 430 Clientes / CR income account', () => {
    const entry = buildEntryFromInvoice(income('PENDING'), undefined, 'ALQUILER_EXENTO');
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.accountCode).toBe('430');
    expect(debitLine.debit).toBe(1000);
    expect(debitLine.credit).toBe(0);
    expect(creditLine.credit).toBe(1000);
    expect(creditLine.debit).toBe(0);
  });

  it('INCOME PAID: DR 572 Bancos / CR income account', () => {
    const entry = buildEntryFromInvoice(income('PAID'), undefined, 'ALQUILER_EXENTO');
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.accountCode).toBe('572');
    expect(debitLine.debit).toBe(1000);
    expect(creditLine.credit).toBe(1000);
  });

  it('INCOME PROCESSED: same as PENDING (uses 430)', () => {
    const entry = buildEntryFromInvoice(income('PROCESSED'), undefined, 'ALQUILER_EXENTO');
    expect(entry.lines[0].accountCode).toBe('430');
  });

  it('EXPENSE PENDING: DR expense account / CR 410 Acreedores', () => {
    const entry = buildEntryFromInvoice(expense('PENDING'), undefined, 'ALQUILER_EXENTO');
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.debit).toBe(1000);
    expect(creditLine.accountCode).toBe('410');
    expect(creditLine.credit).toBe(1000);
  });

  it('EXPENSE PAID: DR expense account / CR 572 Bancos', () => {
    const entry = buildEntryFromInvoice(expense('PAID'), undefined, 'ALQUILER_EXENTO');
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.debit).toBe(1000);
    expect(creditLine.accountCode).toBe('572');
    expect(creditLine.credit).toBe(1000);
  });

  it('entries are balanced (total debit === total credit)', () => {
    const statuses: Invoice['status'][] = ['PENDING', 'PROCESSED', 'PAID'];
    const types: Invoice['type'][] = ['INCOME', 'EXPENSE'];
    for (const type of types) {
      for (const status of statuses) {
        const inv: Invoice = { ...BASE_INVOICE, type, status };
        const entry = buildEntryFromInvoice(inv, undefined, 'ALQUILER_EXENTO');
        const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
        expect(totalDebit).toBe(totalCredit);
      }
    }
  });

  it('never produces accounts 472 or 477 (no VAT in IRPF)', () => {
    const statuses: Invoice['status'][] = ['PENDING', 'PROCESSED', 'PAID'];
    const types: Invoice['type'][] = ['INCOME', 'EXPENSE'];
    for (const type of types) {
      for (const status of statuses) {
        const inv: Invoice = { ...BASE_INVOICE, type, status };
        const entry = buildEntryFromInvoice(inv, undefined, 'ALQUILER_EXENTO');
        const codes = entry.lines.map(l => l.accountCode);
        expect(codes).not.toContain('472');
        expect(codes).not.toContain('477');
      }
    }
  });
});

describe('buildEntryFromInvoice — GENERAL (legacy single-line)', () => {
  it('EXPENSE: produces a single debit line', () => {
    const entry = buildEntryFromInvoice(expense('PENDING'), undefined, 'GENERAL');
    expect(entry.lines).toHaveLength(1);
    expect(entry.lines[0].debit).toBe(1000);
    expect(entry.lines[0].credit).toBe(0);
  });

  it('INCOME: produces a single credit line', () => {
    const entry = buildEntryFromInvoice(income('PENDING'), undefined, 'GENERAL');
    expect(entry.lines).toHaveLength(1);
    expect(entry.lines[0].credit).toBe(1000);
    expect(entry.lines[0].debit).toBe(0);
  });

  it('defaults to ALQUILER_EXENTO when no regime supplied', () => {
    const entry = buildEntryFromInvoice(income('PAID'));
    expect(entry.lines).toHaveLength(2);
  });
});

describe('buildClosingEntry — PROCESSED→PAID settlement', () => {
  it('INCOME: DR 572 Bancos / CR 430 Clientes', () => {
    const entry = buildClosingEntry(income('PAID'));
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.accountCode).toBe('572');
    expect(debitLine.debit).toBe(1000);
    expect(creditLine.accountCode).toBe('430');
    expect(creditLine.credit).toBe(1000);
  });

  it('EXPENSE: DR 410 Acreedores / CR 572 Bancos', () => {
    const entry = buildClosingEntry(expense('PAID'));
    expect(entry.lines).toHaveLength(2);
    const [debitLine, creditLine] = entry.lines;
    expect(debitLine.accountCode).toBe('410');
    expect(debitLine.debit).toBe(1000);
    expect(creditLine.accountCode).toBe('572');
    expect(creditLine.credit).toBe(1000);
  });

  it('closing entry is balanced', () => {
    for (const type of ['INCOME', 'EXPENSE'] as Invoice['type'][]) {
      const inv: Invoice = { ...BASE_INVOICE, type, status: 'PAID' };
      const entry = buildClosingEntry(inv);
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBe(totalCredit);
    }
  });

  it('closing entry id is prefixed with CLOSE-', () => {
    const entry = buildClosingEntry(income('PAID'));
    expect(entry.id).toMatch(/^CLOSE-/);
  });

  it('closing entry links back to the invoice via invoiceId', () => {
    const inv = income('PAID');
    const entry = buildClosingEntry(inv);
    expect(entry.invoiceId).toBe(inv.id);
  });
});
