/**
 * @fileoverview Shared utilities for invoice-to-accounting-entry conversion.
 *
 * DEBT-002: `createEntryFromInvoice` was duplicated in `hooks/useInvoices.ts`
 * and `hooks/useDataHandlers.ts`.  Both copies are now thin wrappers around
 * `buildEntryFromInvoice`, the single source of truth.
 */

import { Invoice, AccountingEntry } from '../types';

interface EntryAuthor {
  userId?: string;
  userName?: string;
}

/**
 * Resolve the main P&L account code and name from the invoice category.
 *
 * The category field is stored as "<code> - <name>" (e.g. "621 - Arrendamientos").
 * When it is absent the defaults are:
 *   - EXPENSE → 600 (Compras de mercaderías)
 *   - INCOME  → 700 (Ventas de mercaderías)
 */
const resolveMainAccount = (inv: Invoice): { accountCode: string; accountName: string } => {
  const defaults =
    inv.type === 'EXPENSE'
      ? { accountCode: '600', accountName: 'Compras de mercaderías' }
      : { accountCode: '700', accountName: 'Ventas de mercaderías' };

  if (!inv.category) return defaults;

  const parts = inv.category.split(' - ');
  if (parts.length > 1) {
    return {
      accountCode: parts[0].trim(),
      accountName: parts.slice(1).join(' - ').trim(),
    };
  }
  return { accountCode: parts[0].trim(), accountName: defaults.accountName };
};

/**
 * Build an AccountingEntry from an Invoice using real double-entry bookkeeping.
 *
 * Two-line template (no VAT — CBGest uses IRPF-only simplified accounting):
 *
 *   EXPENSE invoice
 *     Debe  6xx  (gasto, from category)     totalAmount
 *     Haber 400  (Proveedores)              totalAmount  ← PENDING / PROCESSED
 *     Haber 572  (Bancos c/c)              totalAmount  ← PAID
 *
 *   INCOME invoice
 *     Debe  430  (Clientes)                totalAmount  ← PENDING / PROCESSED
 *     Debe  572  (Bancos c/c)              totalAmount  ← PAID
 *     Haber 7xx  (ingreso, from category)  totalAmount
 *
 * @param inv    - The invoice to convert.
 * @param author - Optional user info (createdBy / createdByName).
 * @returns A new AccountingEntry ready to be persisted.
 */
export const buildEntryFromInvoice = (inv: Invoice, author?: EntryAuthor): AccountingEntry => {
  const { accountCode, accountName } = resolveMainAccount(inv);
  // Guard: ensure amount is a finite non-negative number
  const amount = Number.isFinite(inv.totalAmount) && inv.totalAmount >= 0 ? inv.totalAmount : 0;
  const isPaid = inv.status === 'PAID';

  // Counterpart account: 400/430 when pending, 572 when paid
  const counterCode = isPaid ? '572' : inv.type === 'EXPENSE' ? '400' : '430';
  const counterName = isPaid
    ? 'Bancos e instituciones de crédito c/c vista, euros'
    : inv.type === 'EXPENSE'
    ? 'Proveedores'
    : 'Clientes';

  const lines =
    inv.type === 'EXPENSE'
      ? [
          { accountCode, accountName, debit: amount, credit: 0 },
          { accountCode: counterCode, accountName: counterName, debit: 0, credit: amount },
        ]
      : [
          { accountCode: counterCode, accountName: counterName, debit: amount, credit: 0 },
          { accountCode, accountName, debit: 0, credit: amount },
        ];

  return {
    id: `AUTO-${inv.id}`,
    date: inv.date,
    concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
    lines,
    // Legacy scalar fields — kept for backward compatibility with old single-line readers
    accountCode: lines[0].accountCode,
    accountName: lines[0].accountName,
    debit: lines[0].debit,
    credit: lines[0].credit,
    // Links
    invoiceId: inv.id,
    supplierId: inv.supplierId,
    apartmentId: inv.apartmentId,
    fiscalYearId: inv.fiscalYearId,
    // File references
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
