import { describe, expect, it } from 'vitest';
import {
  buildEntryFromUnmatchedTransaction,
  buildInvoiceSettlementEntry,
  findReconciliationMatches,
  isSignCompatibleMatch,
} from '../reconciliationUtils';
import { AccountingEntry, BankTransaction, Invoice } from '../../types';

const baseTransaction: BankTransaction = {
  id: 'tx-1',
  date: '2026-07-10',
  concept: 'Transferencia proveedor limpieza',
  amount: -120,
  status: 'PENDING'
};

const invoiceEntry: AccountingEntry = {
  id: 'AUTO-inv-1',
  date: '2026-07-09',
  concept: 'Factura F-001 - Limpiezas SL',
  lines: [{ accountCode: '600', accountName: 'Compras', debit: 120, credit: 0 }],
  invoiceId: 'inv-1',
  reconciled: false
};

const supplierEntry: AccountingEntry = {
  id: 'entry-400',
  date: '2026-07-09',
  concept: 'Factura proveedor',
  lines: [
    { accountCode: '628', accountName: 'Suministros', debit: 100, credit: 0 },
    { accountCode: '400', accountName: 'Proveedores', debit: 0, credit: 100 },
  ],
  reconciled: false,
};

const clientEntry: AccountingEntry = {
  id: 'entry-430',
  date: '2026-07-09',
  concept: 'Factura cliente',
  lines: [
    { accountCode: '430', accountName: 'Clientes', debit: 100, credit: 0 },
    { accountCode: '705', accountName: 'Prestaciones', debit: 0, credit: 100 },
  ],
  reconciled: false,
};

describe('reconciliationUtils', () => {
  describe('findReconciliationMatches (CONC-001)', () => {
    it('matches cargo only with supplier/expense entries, not client entries', () => {
      const matches = findReconciliationMatches(-100, [supplierEntry, clientEntry]);
      expect(matches.map((e) => e.id)).toEqual(['entry-400']);
    });

    it('matches abono only with client/income entries, not supplier entries', () => {
      const matches = findReconciliationMatches(100, [supplierEntry, clientEntry]);
      expect(matches.map((e) => e.id)).toEqual(['entry-430']);
    });

    it('excludes draft entries from candidates', () => {
      const draftSupplier: AccountingEntry = { ...supplierEntry, id: 'draft-400', isDraft: true };
      const matches = findReconciliationMatches(-100, [draftSupplier, supplierEntry]);
      expect(matches.map((e) => e.id)).toEqual(['entry-400']);
    });

    it('rejects amount mismatch even when sign is compatible', () => {
      const matches = findReconciliationMatches(-50, [supplierEntry]);
      expect(matches).toHaveLength(0);
    });

    it('uses precomputed amount map when provided', () => {
      const amountMap = new Map([['entry-400', 100]]);
      const matches = findReconciliationMatches(-100, [supplierEntry], amountMap);
      expect(matches).toHaveLength(1);
    });
  });

  describe('isSignCompatibleMatch (CONC-001)', () => {
    it('classifies 400 as cargo-compatible and 430 as abono-compatible', () => {
      expect(isSignCompatibleMatch(-100, supplierEntry)).toBe(true);
      expect(isSignCompatibleMatch(100, supplierEntry)).toBe(false);
      expect(isSignCompatibleMatch(100, clientEntry)).toBe(true);
      expect(isSignCompatibleMatch(-100, clientEntry)).toBe(false);
    });

    it('infers sign from 6xx debit / 7xx credit when 400/430 are absent', () => {
      expect(isSignCompatibleMatch(-120, invoiceEntry)).toBe(true);
      expect(isSignCompatibleMatch(120, invoiceEntry)).toBe(false);

      const incomeOnly: AccountingEntry = {
        id: 'inc-1',
        date: '2026-07-09',
        concept: 'Ingreso',
        lines: [{ accountCode: '705', accountName: 'Prestaciones', debit: 0, credit: 120 }],
        reconciled: false,
      };
      expect(isSignCompatibleMatch(120, incomeOnly)).toBe(true);
      expect(isSignCompatibleMatch(-120, incomeOnly)).toBe(false);
    });
  });

  describe('buildEntryFromUnmatchedTransaction', () => {
    it('uses 6xx/7xx against 572 for non-financial transactions', () => {
      const expenseEntry = buildEntryFromUnmatchedTransaction(baseTransaction, 'BANK-1');
      expect(expenseEntry.lines[0].accountCode).toBe('629');
      expect(expenseEntry.lines[1].accountCode).toBe('572');

      const incomeEntry = buildEntryFromUnmatchedTransaction({
        ...baseTransaction,
        id: 'tx-2',
        concept: 'Cobro reserva julio',
        amount: 450
      }, 'BANK-2');
      expect(incomeEntry.lines[0].accountCode).toBe('705');
      expect(incomeEntry.lines[1].accountCode).toBe('572');
    });

    it('reserves 626/769 for financial concepts', () => {
      const expenseEntry = buildEntryFromUnmatchedTransaction({
        ...baseTransaction,
        concept: 'Comisión mantenimiento cuenta'
      }, 'BANK-3');
      expect(expenseEntry.lines[0].accountCode).toBe('626');

      const incomeEntry = buildEntryFromUnmatchedTransaction({
        ...baseTransaction,
        id: 'tx-3',
        concept: 'Interés abonado por banco',
        amount: 12
      }, 'BANK-4');
      expect(incomeEntry.lines[0].accountCode).toBe('769');
    });

    it('detects plain financial keywords as full words', () => {
      const expenseEntry = buildEntryFromUnmatchedTransaction({
        ...baseTransaction,
        concept: 'Comision'
      }, 'BANK-6');

      expect(expenseEntry.lines[0].accountCode).toBe('626');
    });

    it('avoids false positives for partial keyword matches', () => {
      const expenseEntry = buildEntryFromUnmatchedTransaction({
        ...baseTransaction,
        concept: 'Comisionar servicio de limpieza'
      }, 'BANK-5');

      expect(expenseEntry.lines[0].accountCode).toBe('629');
    });
  });

  describe('buildInvoiceSettlementEntry', () => {
    it('creates settlement entry with 572 against 400 for expense invoices', () => {
      const invoice: Invoice = {
        id: 'inv-1',
        number: 'F-001',
        date: '2026-07-09',
        issuerName: 'Limpiezas SL',
        issuerNif: 'B12345678',
        baseAmount: 120,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 120,
        type: 'EXPENSE',
        status: 'PENDING',
        history: []
      };

      const settlement = buildInvoiceSettlementEntry(baseTransaction, invoiceEntry, 'RECON-1', invoice);
      expect(settlement.lines[0]).toMatchObject({ accountCode: '400', debit: 120, credit: 0 });
      expect(settlement.lines[1]).toMatchObject({ accountCode: '572', debit: 0, credit: 120 });
      expect(settlement.invoiceId).toBe('inv-1');
      expect(settlement.transactionId).toBe('tx-1');
      expect(settlement.reconciled).toBe(true);
    });

    it('keeps traceability invoice ↔ transaction ↔ settlement entry', () => {
      const settlement = buildInvoiceSettlementEntry(baseTransaction, invoiceEntry, 'RECON-TRACE');
      const totalDebit = settlement.lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = settlement.lines.reduce((sum, line) => sum + line.credit, 0);

      expect(settlement.id).toBe('RECON-TRACE');
      expect(settlement.concept).toContain(invoiceEntry.concept);
      expect(settlement.invoiceId).toBe(invoiceEntry.invoiceId);
      expect(settlement.transactionId).toBe(baseTransaction.id);
      expect(totalDebit).toBe(totalCredit);
    });

    it('creates settlement entry with 572 against 430 for income invoices', () => {
      const settlement = buildInvoiceSettlementEntry(
        { ...baseTransaction, amount: 120, concept: 'Cobro factura cliente' },
        { ...invoiceEntry, id: 'AUTO-inv-2', invoiceId: 'inv-2' },
        'RECON-2',
        {
          id: 'inv-2',
          number: 'I-001',
          date: '2026-07-10',
          issuerName: 'Cliente',
          issuerNif: '12345678Z',
          baseAmount: 120,
          vatRate: 0,
          vatAmount: 0,
          totalAmount: 120,
          type: 'INCOME',
          status: 'PENDING',
          history: []
        },
      );

      expect(settlement.lines[0]).toMatchObject({ accountCode: '430', debit: 0, credit: 120 });
      expect(settlement.lines[1]).toMatchObject({ accountCode: '572', debit: 120, credit: 0 });
    });
  });
});
