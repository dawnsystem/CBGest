import { describe, expect, it } from 'vitest';
import { buildEntryFromUnmatchedTransaction, buildInvoiceSettlementEntry } from '../reconciliationUtils';
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

describe('reconciliationUtils', () => {
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
