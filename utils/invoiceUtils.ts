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
 * Build an AccountingEntry from an Invoice.
 *
 * @param inv    - The invoice to convert.
 * @param author - Optional user info (createdBy / createdByName).
 * @returns A new AccountingEntry ready to be persisted.
 */
export const buildEntryFromInvoice = (inv: Invoice, author?: EntryAuthor): AccountingEntry => {
  let accountCode = inv.type === 'EXPENSE' ? '600' : '700';
  let accountName = inv.type === 'EXPENSE' ? 'Compras' : 'Ventas';

  if (inv.category) {
    const parts = inv.category.split(' - ');
    if (parts.length > 1) {
      accountCode = parts[0].trim();
      accountName = parts.slice(1).join(' - ').trim();
    } else {
      accountCode = parts[0].trim();
      accountName = accountCode;
    }
  }

  const totalAmount = Number.isFinite(inv.totalAmount) && inv.totalAmount >= 0 ? inv.totalAmount : 0;
  const debit = inv.type === 'EXPENSE' ? totalAmount : 0;
  const credit = inv.type === 'INCOME' ? totalAmount : 0;
  const settlementLine = inv.type === 'EXPENSE'
    ? { accountCode: '400', accountName: 'Proveedores', debit: 0, credit: totalAmount }
    : { accountCode: '430', accountName: 'Clientes', debit: totalAmount, credit: 0 };

  return {
    id: `AUTO-${inv.id}`,
    date: inv.date,
    concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
    lines: [{ accountCode, accountName, debit, credit }, settlementLine],
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
