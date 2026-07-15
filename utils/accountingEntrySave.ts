import { AccountingEntry, AccountingEntryLine } from '../types';

/**
 * Construye el payload de un asiento formal listo para persistir.
 * Fuerza `isDraft: false` para que un borrador cuadrado pase a asiento oficial
 * y deje de quedar excluido de TrialBalance / AccountLedger / DebtsPendingPanel.
 *
 * @param editingEntry - Asiento en edición (puede venir con `isDraft: true`)
 * @param validLines - Líneas válidas (cuenta + importe > 0) ya filtradas
 * @returns Asiento formal con campos legacy sincronizados desde la primera línea
 * @throws Nunca lanza; asume que `validLines` tiene al menos un elemento
 * @example
 * const formal = buildFormalEntryToSave(draftEntry, validLines);
 * // formal.isDraft === false aunque draftEntry.isDraft === true
 */
export function buildFormalEntryToSave(
  editingEntry: AccountingEntry,
  validLines: AccountingEntryLine[]
): AccountingEntry {
  return {
    ...editingEntry,
    lines: validLines,
    isDraft: false,
    // Set legacy fields from first line for compatibility
    accountCode: validLines[0].accountCode,
    accountName: validLines[0].accountName,
    debit: validLines[0].debit,
    credit: validLines[0].credit,
  };
}
