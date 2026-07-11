/**
 * @fileoverview Shared utilities for invoice-to-accounting-entry conversion.
 *
 * DEBT-002: `createEntryFromInvoice` was duplicated in `hooks/useInvoices.ts`
 * and `hooks/useDataHandlers.ts`.  Both copies are now thin wrappers around
 * `buildEntryFromInvoice`, the single source of truth.
 *
 * ## Flujo oficial IRPF Simplificado (régimen ALQUILER_EXENTO)
 *
 * CBGest opera exclusivamente bajo régimen IRPF sin IVA.
 * No se usan las cuentas 472 (IVA soportado) ni 477 (IVA repercutido).
 *
 * ### Factura devengada → asiento de 2 líneas
 *
 * **Ingreso (INCOME)**
 * | Debe | Haber |
 * |------|-------|
 * | 430 Clientes (si PENDING) / 572 Bancos (si PAID) | 7xx Ingresos |
 *
 * **Gasto (EXPENSE)**
 * | Debe | Haber |
 * |------|-------|
 * | 6xx Gastos | 410 Acreedores (si PENDING) / 572 Bancos (si PAID) |
 *
 * ### Cobro/Pago bancario → cierra el pendiente
 * Cuando la transacción bancaria se concilia, el asiento de banco (572)
 * compensa la cuenta pendiente (430 clientes / 410 acreedores), cerrando
 * el ciclo contable de la operación.
 */

import { Invoice, AccountingEntry } from '../types';

interface EntryAuthor {
  userId?: string;
  userName?: string;
}

/**
 * Build an AccountingEntry from an Invoice.
 *
 * For `ALQUILER_EXENTO` (IRPF Simplificado) regime the entry has **two lines**:
 * - Income: DR 430/572 (pending/paid) — CR income account
 * - Expense: DR expense account — CR 410/572 (pending/paid)
 *
 * Cuentas 472 (IVA soportado) y 477 (IVA repercutido) nunca aparecen
 * en este régimen.
 *
 * For `GENERAL` regime the legacy single-line entry is kept for backward
 * compatibility with existing entries.
 *
 * @param inv          - The invoice to convert.
 * @param author       - Optional user info (createdBy / createdByName).
 * @param fiscalRegime - The active fiscal regime; defaults to `'ALQUILER_EXENTO'`.
 * @returns A new AccountingEntry ready to be persisted.
 */
export const buildEntryFromInvoice = (
  inv: Invoice,
  author?: EntryAuthor,
  fiscalRegime: 'GENERAL' | 'ALQUILER_EXENTO' = 'ALQUILER_EXENTO',
): AccountingEntry => {
  let accountCode = inv.type === 'EXPENSE' ? '600' : '700';
  let accountName = inv.type === 'EXPENSE' ? 'Compras' : 'Ventas';

  if (inv.category) {
    const parts = inv.category.split(' - ');
    if (parts.length > 1) {
      accountCode = parts[0].trim();
      accountName = parts.slice(1).join(' - ').trim();
    } else {
      accountCode = parts[0].trim();
    }
  }

  // ----------------------------------------------------------------
  // IRPF Simplificado: build a proper 2-line double-entry.
  // Cuentas 472/477 (IVA) never appear in this regime.
  // In IRPF, totalAmount === baseAmount (no separate VAT component).
  // ----------------------------------------------------------------
  if (fiscalRegime === 'ALQUILER_EXENTO') {
    const amount = inv.totalAmount;
    // Counter-part: use bank account (572) if already paid, pending account otherwise.
    const isPaid = inv.status === 'PAID';

    if (inv.type === 'INCOME') {
      // DR 430 Clientes (cobro pendiente) / 572 Bancos (si cobrado)
      // CR income account
      const counterCode = isPaid ? '572' : '430';
      const counterName = isPaid
        ? 'Bancos e instituciones de crédito c/c vista, euros'
        : 'Clientes';
      return {
        id: `AUTO-${inv.id}`,
        date: inv.date,
        concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
        lines: [
          { accountCode: counterCode, accountName: counterName, debit: amount, credit: 0 },
          { accountCode, accountName, debit: 0, credit: amount },
        ],
        // Legacy scalar fields (backward-compat with single-line views)
        accountCode: counterCode,
        accountName: counterName,
        debit: amount,
        credit: 0,
        invoiceId: inv.id,
        referenceDoc: inv.file,
        fileData: inv.fileData,
        fileType: inv.fileType,
        appwriteFileId: inv.appwriteFileId,
        reconciled: false,
        createdBy: inv.createdBy || author?.userId,
        createdByName: inv.createdByName || author?.userName,
        createdAt: new Date().toISOString(),
      };
    } else {
      // EXPENSE
      // DR expense account
      // CR 410 Acreedores (pago pendiente) / 572 Bancos (si pagado)
      const counterCode = isPaid ? '572' : '410';
      const counterName = isPaid
        ? 'Bancos e instituciones de crédito c/c vista, euros'
        : 'Acreedores por prestaciones de servicios';
      return {
        id: `AUTO-${inv.id}`,
        date: inv.date,
        concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
        lines: [
          { accountCode, accountName, debit: amount, credit: 0 },
          { accountCode: counterCode, accountName: counterName, debit: 0, credit: amount },
        ],
        // Legacy scalar fields (backward-compat with single-line views)
        accountCode,
        accountName,
        debit: amount,
        credit: 0,
        invoiceId: inv.id,
        referenceDoc: inv.file,
        fileData: inv.fileData,
        fileType: inv.fileType,
        appwriteFileId: inv.appwriteFileId,
        reconciled: false,
        createdBy: inv.createdBy || author?.userId,
        createdByName: inv.createdByName || author?.userName,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // ----------------------------------------------------------------
  // GENERAL regime: legacy single-line entry (backward-compat).
  // ----------------------------------------------------------------
  const amount = inv.totalAmount;
  const debit = inv.type === 'EXPENSE' ? amount : 0;
  const credit = inv.type === 'INCOME' ? amount : 0;

  return {
    id: `AUTO-${inv.id}`,
    date: inv.date,
    concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
    lines: [{ accountCode, accountName, debit, credit }],
    // Legacy scalar fields for backward compatibility
    accountCode,
    accountName,
    debit,
    credit,
    invoiceId: inv.id,
    referenceDoc: inv.file,
    fileData: inv.fileData,
    fileType: inv.fileType,
    appwriteFileId: inv.appwriteFileId,
    reconciled: false,
    createdBy: inv.createdBy || author?.userId,
    createdByName: inv.createdByName || author?.userName,
    createdAt: new Date().toISOString(),
  };
};
