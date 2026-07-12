import { AccountingEntry, BankTransaction, Invoice } from '../types';

const BANK_ACCOUNT = {
  code: '572',
  name: 'Bancos e instituciones de crédito c/c vista, euros'
} as const;

const FINANCIAL_KEYWORDS = [
  'comision',
  'interes',
  'mantenimiento',
  'descubierto',
  'financiacion'
];

const includesFinancialKeyword = (concept: string): boolean => {
  const normalized = concept
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return FINANCIAL_KEYWORDS.some(keyword => normalized.includes(keyword));
};

export const getTransactionCounterpartyAccount = (tx: BankTransaction): { code: string; name: string } => {
  const isExpense = tx.amount < 0;
  const isFinancial = includesFinancialKeyword(tx.concept);

  if (isExpense) {
    return isFinancial
      ? { code: '626', name: 'Servicios bancarios y similares' }
      : { code: '629', name: 'Otros servicios' };
  }

  return isFinancial
    ? { code: '769', name: 'Otros ingresos financieros' }
    : { code: '705', name: 'Prestaciones de servicios' };
};

export const buildEntryFromUnmatchedTransaction = (
  tx: BankTransaction,
  entryId: string
): AccountingEntry => {
  const absAmount = Math.abs(tx.amount);
  const isExpense = tx.amount < 0;
  const counterparty = getTransactionCounterpartyAccount(tx);

  const bankLine = {
    accountCode: BANK_ACCOUNT.code,
    accountName: BANK_ACCOUNT.name,
    debit: isExpense ? 0 : absAmount,
    credit: isExpense ? absAmount : 0
  };

  const counterLine = {
    accountCode: counterparty.code,
    accountName: counterparty.name,
    debit: isExpense ? absAmount : 0,
    credit: isExpense ? 0 : absAmount
  };

  return {
    id: entryId,
    date: tx.date,
    concept: tx.concept,
    lines: [counterLine, bankLine],
    accountCode: counterLine.accountCode,
    accountName: counterLine.accountName,
    debit: counterLine.debit,
    credit: counterLine.credit,
    transactionId: tx.id,
    reconciled: true
  };
};

export const buildInvoiceSettlementEntry = (
  tx: BankTransaction,
  matchedEntry: AccountingEntry,
  entryId: string,
  invoice?: Invoice
): AccountingEntry => {
  const absAmount = Math.abs(tx.amount);
  const isExpense = invoice
    ? invoice.type === 'EXPENSE'
    : tx.amount < 0;
  const pendingAccount = isExpense
    ? { code: '400', name: 'Proveedores' }
    : { code: '430', name: 'Clientes' };

  const pendingLine = {
    accountCode: pendingAccount.code,
    accountName: pendingAccount.name,
    debit: isExpense ? absAmount : 0,
    credit: isExpense ? 0 : absAmount
  };
  const bankLine = {
    accountCode: BANK_ACCOUNT.code,
    accountName: BANK_ACCOUNT.name,
    debit: isExpense ? 0 : absAmount,
    credit: isExpense ? absAmount : 0
  };

  return {
    id: entryId,
    date: tx.date,
    concept: `Cierre deuda factura: ${matchedEntry.concept}`,
    lines: [pendingLine, bankLine],
    accountCode: pendingLine.accountCode,
    accountName: pendingLine.accountName,
    debit: pendingLine.debit,
    credit: pendingLine.credit,
    invoiceId: matchedEntry.invoiceId,
    transactionId: tx.id,
    reconciled: true
  };
};
