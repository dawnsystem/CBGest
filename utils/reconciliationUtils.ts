import { AccountingEntry, BankTransaction, Invoice, calculateEntryTotals, getEntryLines } from '../types';

const BANK_ACCOUNT = {
  code: '572',
  name: 'Bancos e instituciones de crédito c/c vista, euros'
} as const;

/** Tolerancia en euros para emparejar importes de conciliación (CONC-001). */
export const RECONCILIATION_AMOUNT_TOLERANCE = 0.05;

/**
 * Indica si el signo del movimiento bancario es compatible con el asiento candidato.
 *
 * Cargo (importe &lt; 0) → asiento de proveedores (400/41x) o gasto (6xx en Debe).
 * Abono (importe &gt; 0) → asiento de clientes (430/44x) o ingreso (7xx en Haber).
 * Si hay 400 y 430 a la vez, se acepta (asiento mixto raro). Si no hay pistas, se rechaza.
 *
 * @param movementAmount - Importe del movimiento (negativo = cargo, positivo = abono)
 * @param entry - Asiento candidato sin línea de banco
 * @returns true si el signo encaja con la naturaleza del asiento
 * @example
 * isSignCompatibleMatch(-120, entryWith400) // true
 * isSignCompatibleMatch(-120, entryWith430) // false
 */
export const isSignCompatibleMatch = (
  movementAmount: number,
  entry: AccountingEntry
): boolean => {
  if (movementAmount === 0) return false;

  const lines = getEntryLines(entry);
  const hasPayable = lines.some(
    (line) => line.accountCode.startsWith('400') || line.accountCode.startsWith('41')
  );
  const hasReceivable = lines.some(
    (line) => line.accountCode.startsWith('430') || line.accountCode.startsWith('44')
  );

  if (hasPayable !== hasReceivable) {
    return movementAmount < 0 ? hasPayable : hasReceivable;
  }

  if (hasPayable && hasReceivable) return true;

  const hasExpenseDebit = lines.some(
    (line) => line.accountCode.startsWith('6') && (line.debit || 0) > 0
  );
  const hasIncomeCredit = lines.some(
    (line) => line.accountCode.startsWith('7') && (line.credit || 0) > 0
  );

  if (hasExpenseDebit !== hasIncomeCredit) {
    return movementAmount < 0 ? hasExpenseDebit : hasIncomeCredit;
  }

  return false;
};

/**
 * Filtra asientos candidatos para conciliar un movimiento bancario por importe y signo.
 *
 * Excluye borradores (`isDraft`). Compara el valor absoluto del movimiento con el
 * mayor de Debe/Haber del asiento, con tolerancia de 5 céntimos, y exige compatibilidad
 * de signo (CONC-001: cargo ↔ 400/gasto, abono ↔ 430/ingreso).
 *
 * @param movementAmount - Importe firmado del movimiento bancario
 * @param candidates - Asientos no conciliados sin línea de tesorería
 * @param amountByEntryId - Mapa opcional id→importe precalculado (PERF)
 * @param tolerance - Tolerancia en euros (por defecto {@link RECONCILIATION_AMOUNT_TOLERANCE})
 * @returns Asientos compatibles por importe y signo
 * @example
 * findReconciliationMatches(-100, [supplierEntry, clientEntry])
 * // → [supplierEntry]
 */
export const findReconciliationMatches = (
  movementAmount: number,
  candidates: AccountingEntry[],
  amountByEntryId?: Map<string, number>,
  tolerance: number = RECONCILIATION_AMOUNT_TOLERANCE
): AccountingEntry[] => {
  const movementAmountAbs = Math.abs(movementAmount);

  return candidates.filter((entry) => {
    if (entry.isDraft) return false;

    const entryAmount =
      amountByEntryId?.get(entry.id) ??
      (() => {
        const totals = calculateEntryTotals(entry);
        return Math.max(totals.totalDebit, totals.totalCredit);
      })();

    if (Math.abs(movementAmountAbs - entryAmount) >= tolerance) return false;
    return isSignCompatibleMatch(movementAmount, entry);
  });
};

const FINANCIAL_KEYWORDS = [
  'comision',
  'interes',
  'mantenimiento',
  'descubierto',
  'financiacion'
];

/**
 * Detects whether a bank concept contains a financial keyword as a full word.
 *
 * The concept is normalized to NFD and stripped of diacritics (e.g. "comisión" -> "comision")
 * so matching is accent-insensitive. We split by non-alphanumeric boundaries to avoid
 * substring false positives such as matching "comisionar" for the keyword "comision".
 */
const includesFinancialKeyword = (concept: string): boolean => {
  const normalized = concept
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return FINANCIAL_KEYWORDS.some(keyword => words.includes(keyword));
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
