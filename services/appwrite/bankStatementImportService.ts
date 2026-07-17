/**
 * @fileoverview Registro de extractos bancarios importados (deduplicación).
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { BankStatementImport } from '../../types';

type BankStatementImportDocument = AppwriteEntity<BankStatementImport> & { $id: string };

const LOCAL_STORAGE_KEY = 'gestcb_bank_statement_imports';

/**
 * Reads local fallback registry (non-Appwrite / offline schema).
 *
 * @returns Imports stored in localStorage
 */
function readLocalImports(): BankStatementImport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BankStatementImport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists local fallback registry.
 *
 * @param imports - Full list to store
 */
function writeLocalImports(imports: BankStatementImport[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(imports));
  } catch (e) {
    console.warn('[bankStatementImportService] Failed to persist local imports registry:', e);
  }
}

/**
 * Creates a bank statement import registry document.
 *
 * @param record - Import metadata (without requiring appwriteId)
 * @returns Saved import with ids
 * @throws When Appwrite create fails (non-404)
 * @example
 * ```ts
 * await createBankStatementImport({ id: 'x', contentFingerprint: '...', transactionCount: 3, importedAt: new Date().toISOString() });
 * ```
 */
export async function createBankStatementImport(
  record: BankStatementImport
): Promise<BankStatementImport> {
  try {
    if (!config.collections.bankStatementImports) {
      writeLocalImports([...readLocalImports(), record]);
      return record;
    }

    const { id } = record;
    const data = omitFields(record as AppwriteEntity<BankStatementImport>, [
      'id',
      'appwriteId',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);

    const doc = await withRetry(
      () =>
        databases.createDocument(
          config.databaseId,
          config.collections.bankStatementImports,
          id || ID.unique(),
          data
        ),
      'createBankStatementImport'
    );

    setConnectionHealth(true);
    const saved = {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
    } as unknown as BankStatementImport;

    // Keep local mirror for fast subsequent checks in-session
    writeLocalImports([...readLocalImports().filter((r) => r.id !== saved.id), saved]);
    return saved;
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) {
      writeLocalImports([...readLocalImports().filter((r) => r.id !== record.id), record]);
      return record;
    }
    notifyError(
      error instanceof Error ? error.message : String(error),
      'createBankStatementImport'
    );
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Lists import registry rows for a fiscal year (or all).
 *
 * @param fiscalYearId - Optional fiscal year filter
 * @returns Import records
 * @example
 * ```ts
 * const rows = await getBankStatementImports(fyId);
 * ```
 */
export async function getBankStatementImports(
  fiscalYearId?: string
): Promise<BankStatementImport[]> {
  try {
    if (!config.collections.bankStatementImports) {
      const local = readLocalImports();
      return fiscalYearId
        ? local.filter((r) => r.fiscalYearId === fiscalYearId)
        : local;
    }

    const queries = [Query.orderDesc('importedAt'), Query.limit(500)];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }

    const response = await withRetry(
      () =>
        databases.listDocuments(
          config.databaseId,
          config.collections.bankStatementImports,
          queries
        ),
      'getBankStatementImports'
    );

    setConnectionHealth(true);
    const rows = response.documents.map((doc) => {
      const importDoc = doc as BankStatementImportDocument;
      return {
        ...importDoc,
        id: importDoc.$id,
        appwriteId: importDoc.$id,
      };
    }) as BankStatementImport[];

    writeLocalImports(rows);
    return rows;
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) {
      const local = readLocalImports();
      return fiscalYearId
        ? local.filter((r) => r.fiscalYearId === fiscalYearId)
        : local;
    }
    notifyError(
      error instanceof Error ? error.message : String(error),
      'getBankStatementImports'
    );
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Finds an import by exact file SHA-256 within a fiscal year.
 *
 * @param fileSha256 - Hex digest of file bytes
 * @param fiscalYearId - Active fiscal year id
 * @returns Matching import or null
 * @example
 * ```ts
 * const hit = await findImportByFileSha256(sha, fyId);
 * ```
 */
export async function findImportByFileSha256(
  fileSha256: string,
  fiscalYearId?: string
): Promise<BankStatementImport | null> {
  if (!fileSha256) return null;

  try {
    if (!config.collections.bankStatementImports) {
      const local = readLocalImports();
      return (
        local.find(
          (r) =>
            r.fileSha256 === fileSha256 &&
            (!fiscalYearId || r.fiscalYearId === fiscalYearId)
        ) || null
      );
    }

    const queries = [Query.equal('fileSha256', fileSha256), Query.limit(1)];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }

    const response = await withRetry(
      () =>
        databases.listDocuments(
          config.databaseId,
          config.collections.bankStatementImports,
          queries
        ),
      'findImportByFileSha256'
    );

    setConnectionHealth(true);
    const doc = response.documents[0] as BankStatementImportDocument | undefined;
    if (!doc) return null;
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankStatementImport;
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) {
      const local = readLocalImports();
      return (
        local.find(
          (r) =>
            r.fileSha256 === fileSha256 &&
            (!fiscalYearId || r.fiscalYearId === fiscalYearId)
        ) || null
      );
    }
    // Non-fatal for ingest path: degrade to local check
    console.warn('[findImportByFileSha256] falling back to local registry:', error);
    const local = readLocalImports();
    return (
      local.find(
        (r) =>
          r.fileSha256 === fileSha256 &&
          (!fiscalYearId || r.fiscalYearId === fiscalYearId)
      ) || null
    );
  }
}

/**
 * Finds an import by statement content fingerprint within a fiscal year.
 *
 * @param contentFingerprint - SHA-256 of normalized movement set
 * @param fiscalYearId - Active fiscal year id
 * @returns Matching import or null
 * @example
 * ```ts
 * const hit = await findImportByContentFingerprint(fp, fyId);
 * ```
 */
export async function findImportByContentFingerprint(
  contentFingerprint: string,
  fiscalYearId?: string
): Promise<BankStatementImport | null> {
  if (!contentFingerprint) return null;

  try {
    if (!config.collections.bankStatementImports) {
      const local = readLocalImports();
      return (
        local.find(
          (r) =>
            r.contentFingerprint === contentFingerprint &&
            (!fiscalYearId || r.fiscalYearId === fiscalYearId)
        ) || null
      );
    }

    const queries = [
      Query.equal('contentFingerprint', contentFingerprint),
      Query.limit(1),
    ];
    if (fiscalYearId) {
      queries.push(Query.equal('fiscalYearId', fiscalYearId));
    }

    const response = await withRetry(
      () =>
        databases.listDocuments(
          config.databaseId,
          config.collections.bankStatementImports,
          queries
        ),
      'findImportByContentFingerprint'
    );

    setConnectionHealth(true);
    const doc = response.documents[0] as BankStatementImportDocument | undefined;
    if (!doc) return null;
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as BankStatementImport;
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) {
      const local = readLocalImports();
      return (
        local.find(
          (r) =>
            r.contentFingerprint === contentFingerprint &&
            (!fiscalYearId || r.fiscalYearId === fiscalYearId)
        ) || null
      );
    }
    console.warn('[findImportByContentFingerprint] falling back to local registry:', error);
    const local = readLocalImports();
    return (
      local.find(
        (r) =>
          r.contentFingerprint === contentFingerprint &&
          (!fiscalYearId || r.fiscalYearId === fiscalYearId)
      ) || null
    );
  }
}
