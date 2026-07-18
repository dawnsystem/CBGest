/**
 * @fileoverview Persistencia de borradores Modelo 184 en Appwrite.
 */

import { ID, Query } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  withRetry,
  notifyError,
  setConnectionHealth,
} from './infrastructure';
import type { Modelo184Draft, TaxReport, TaxReportStatus } from '../modelo184/types';

type TaxReportDocument = AppwriteEntity<TaxReport> & { $id: string };

const COLLECTION = config.collections.taxReports;

function serializeDraft(draft: Modelo184Draft): string {
  return JSON.stringify(draft);
}

function parseDraft(raw: unknown): Modelo184Draft {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as Modelo184Draft;
  }
  return raw as Modelo184Draft;
}

/**
 * Guarda o actualiza un borrador Modelo 184 en Appwrite.
 */
export async function saveTaxReport(
  draft: Modelo184Draft,
  status: TaxReportStatus = 'DRAFT',
  existingId?: string
): Promise<TaxReport> {
  try {
    const payload = {
      fiscalYearId: draft.fiscalYearId,
      year: draft.ejercicio,
      status,
      draft: serializeDraft(draft),
      exportedAt: status === 'EXPORTED' ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };

    const doc = existingId
      ? await withRetry(
          () => databases.updateDocument(config.databaseId, COLLECTION, existingId, payload),
          'updateTaxReport'
        )
      : await withRetry(
          () => databases.createDocument(config.databaseId, COLLECTION, ID.unique(), {
            ...payload,
            createdAt: new Date().toISOString(),
          }),
          'createTaxReport'
        );

    setConnectionHealth(true);
    const parsedDraft = parseDraft((doc as { draft?: string }).draft);
    return {
      id: doc.$id,
      appwriteId: doc.$id,
      fiscalYearId: String((doc as { fiscalYearId?: string }).fiscalYearId),
      year: Number((doc as { year?: number }).year),
      status: ((doc as { status?: TaxReportStatus }).status || 'DRAFT'),
      draft: parsedDraft,
      exportedAt: (doc as { exportedAt?: string }).exportedAt,
    };
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'saveTaxReport');
    setConnectionHealth(false);
    throw error;
  }
}

/**
 * Obtiene el borrador más reciente de un ejercicio fiscal.
 */
export async function getTaxReportByFiscalYear(fiscalYearId: string): Promise<TaxReport | null> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(config.databaseId, COLLECTION, [
        Query.equal('fiscalYearId', fiscalYearId),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]),
      'getTaxReportByFiscalYear'
    );

    if (response.documents.length === 0) return null;

    const doc = response.documents[0] as TaxReportDocument;
    return {
      id: doc.$id,
      appwriteId: doc.$id,
      fiscalYearId: String(doc.fiscalYearId),
      year: Number(doc.year),
      status: (doc.status as TaxReportStatus) || 'DRAFT',
      draft: parseDraft(doc.draft),
      exportedAt: doc.exportedAt,
      fileHash: doc.fileHash,
      presentationReference: doc.presentationReference,
    };
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'getTaxReportByFiscalYear');
    return null;
  }
}
