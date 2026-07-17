/**
 * Pure helpers to filter duplicate bank statement imports.
 */

import {
  enrichTransactionsWithFingerprints,
  statementContentFingerprint,
  type FingerprintableTransaction,
} from './bankStatementFingerprint';

/** Metadata attached when confirming an import from the upload queue. */
export interface BankImportMeta {
  fileSha256?: string;
  fileName?: string;
}

/** Result of a deduplicated bank import attempt. */
export interface BankImportResult<T extends FingerprintableTransaction = FingerprintableTransaction> {
  /** Transactions that should be persisted */
  toImport: Array<T & { contentFingerprint: string; importBatchId?: string }>;
  /** Lines skipped because they already exist */
  skippedDuplicates: number;
  /** True when the whole statement content was already imported */
  isDuplicateStatement: boolean;
  /** Stable fingerprint of the incoming statement content */
  contentFingerprint: string;
  /** Batch id assigned for this import (undefined when nothing to import) */
  importBatchId?: string;
  /** User-facing summary message */
  message: string;
}

/**
 * Filters incoming movements against known fingerprints and statement hashes.
 *
 * @param incoming - Newly parsed movements
 * @param existingLineFingerprints - Set of contentFingerprint already in the fiscal year
 * @param existingStatementFingerprints - Set of statement content fingerprints already imported
 * @param importBatchId - Optional pre-generated batch id for new lines
 * @returns Dedup decision with messages
 * @example
 * ```ts
 * const result = await prepareBankImport(txs, existingLines, existingStatements, 'batch-1');
 * ```
 */
export async function prepareBankImport<T extends FingerprintableTransaction>(
  incoming: T[],
  existingLineFingerprints: ReadonlySet<string>,
  existingStatementFingerprints: ReadonlySet<string>,
  importBatchId?: string
): Promise<BankImportResult & { toImport: Array<T & { contentFingerprint: string; importBatchId?: string }> }> {
  if (incoming.length === 0) {
    return {
      toImport: [],
      skippedDuplicates: 0,
      isDuplicateStatement: false,
      contentFingerprint: await statementContentFingerprint([]),
      message: 'No se encontraron movimientos en el extracto.',
    };
  }

  const contentFingerprint = await statementContentFingerprint(incoming);

  if (existingStatementFingerprints.has(contentFingerprint)) {
    return {
      toImport: [],
      skippedDuplicates: incoming.length,
      isDuplicateStatement: true,
      contentFingerprint,
      message: 'Este extracto ya fue importado (mismo contenido).',
    };
  }

  const enriched = await enrichTransactionsWithFingerprints(incoming);
  const toImport: Array<T & { contentFingerprint: string; importBatchId?: string }> = [];
  let skippedDuplicates = 0;

  for (const tx of enriched) {
    if (existingLineFingerprints.has(tx.contentFingerprint)) {
      skippedDuplicates += 1;
      continue;
    }
    toImport.push({
      ...tx,
      importBatchId,
    });
  }

  if (toImport.length === 0) {
    return {
      toImport: [],
      skippedDuplicates,
      isDuplicateStatement: true,
      contentFingerprint,
      message: 'Todos los movimientos de este extracto ya existen. Nada que importar.',
    };
  }

  const message =
    skippedDuplicates > 0
      ? `${toImport.length} movimientos nuevos / ${skippedDuplicates} omitidos por duplicado.`
      : `${toImport.length} movimientos listos para importar.`;

  return {
    toImport,
    skippedDuplicates,
    isDuplicateStatement: false,
    contentFingerprint,
    importBatchId,
    message,
  };
}

/**
 * Builds a Set of line fingerprints from existing bank transactions.
 *
 * @param transactions - Existing transactions (may already include contentFingerprint)
 * @returns Set of fingerprints (computes missing ones)
 * @example
 * ```ts
 * const set = await collectExistingLineFingerprints(bankTransactions);
 * ```
 */
export async function collectExistingLineFingerprints(
  transactions: Array<FingerprintableTransaction & { contentFingerprint?: string }>
): Promise<Set<string>> {
  const set = new Set<string>();
  const missing: FingerprintableTransaction[] = [];

  for (const tx of transactions) {
    if (tx.contentFingerprint) {
      set.add(tx.contentFingerprint);
    } else {
      missing.push(tx);
    }
  }

  if (missing.length > 0) {
    const enriched = await enrichTransactionsWithFingerprints(missing);
    for (const tx of enriched) {
      set.add(tx.contentFingerprint);
    }
  }

  return set;
}
