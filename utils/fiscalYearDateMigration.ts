/**
 * @fileoverview Lógica pura para detectar documentos en el ejercicio fiscal equivocado.
 * @description Compara el año calendario de la fecha del documento con el año del ejercicio asignado.
 */

import type { FiscalYear } from '../types';
import { extractCalendarYear } from './fiscalYearValidation';

/** Colecciones transaccionales con fecha relevante para el ejercicio */
export type FiscalYearMismatchCollection = 'invoices' | 'entries' | 'transactions' | 'reservations';

/** Documento detectado en un ejercicio distinto al de su fecha */
export interface FiscalYearDateMismatchItem {
  collection: FiscalYearMismatchCollection;
  documentId: string;
  label: string;
  documentDate: string;
  documentYear: number;
  sourceFiscalYearId: string;
  sourceFiscalYear: number;
  targetFiscalYearId: string;
  targetFiscalYear: number;
}

/** Documento cuya fecha no encaja en ningún ejercicio existente */
export interface FiscalYearDateUnmappableItem {
  collection: FiscalYearMismatchCollection;
  documentId: string;
  label: string;
  documentDate: string;
  documentYear: number;
  sourceFiscalYearId: string;
  sourceFiscalYear: number;
  reason: string;
}

/** Informe de análisis de desajustes fecha ↔ ejercicio */
export interface FiscalYearDateMismatchReport {
  mismatches: FiscalYearDateMismatchItem[];
  unmappable: FiscalYearDateUnmappableItem[];
  summary: {
    invoices: number;
    entries: number;
    transactions: number;
    reservations: number;
    total: number;
  };
}

/** Resultado de la corrección automática */
export interface FiscalYearDateCorrectionResult {
  corrected: number;
  failed: Array<{ documentId: string; collection: FiscalYearMismatchCollection; error: string }>;
  byCollection: {
    invoices: number;
    entries: number;
    transactions: number;
    reservations: number;
  };
}

interface DateCollectionConfig {
  collection: FiscalYearMismatchCollection;
  dateField: string;
  getLabel: (doc: Record<string, unknown>) => string;
}

const DATE_COLLECTIONS: DateCollectionConfig[] = [
  {
    collection: 'invoices',
    dateField: 'date',
    getLabel: (doc) => String(doc.number || doc.issuerName || doc.$id || ''),
  },
  {
    collection: 'entries',
    dateField: 'date',
    getLabel: (doc) => String(doc.concept || doc.$id || ''),
  },
  {
    collection: 'transactions',
    dateField: 'date',
    getLabel: (doc) => String(doc.concept || doc.$id || ''),
  },
  {
    collection: 'reservations',
    dateField: 'checkIn',
    getLabel: (doc) => String(doc.reservationNumber || doc.apartmentName || doc.$id || ''),
  },
];

/**
 * Construye mapas año calendario ↔ ejercicio fiscal.
 *
 * @param fiscalYears - ejercicios disponibles
 */
export function buildFiscalYearMaps(fiscalYears: FiscalYear[]): {
  idToYear: Map<string, number>;
  yearToId: Map<number, string>;
} {
  const idToYear = new Map<string, number>();
  const yearToId = new Map<number, string>();

  for (const fy of fiscalYears) {
    const docId = fy.appwriteId || fy.id;
    idToYear.set(docId, fy.year);
    idToYear.set(fy.id, fy.year);
    if (!yearToId.has(fy.year)) {
      yearToId.set(fy.year, docId);
    }
  }

  return { idToYear, yearToId };
}

/**
 * Analiza documentos de una colección y devuelve desajustes fecha/ejercicio.
 *
 * @param collection - tipo de colección
 * @param documents - documentos Appwrite con fiscalYearId
 * @param idToYear - mapa ID ejercicio → año
 * @param yearToId - mapa año → ID ejercicio
 */
export function analyzeDocumentsForDateMismatch(
  collection: FiscalYearMismatchCollection,
  documents: Array<Record<string, unknown> & { $id: string }>,
  idToYear: Map<string, number>,
  yearToId: Map<number, string>
): { mismatches: FiscalYearDateMismatchItem[]; unmappable: FiscalYearDateUnmappableItem[] } {
  const config = DATE_COLLECTIONS.find((c) => c.collection === collection);
  if (!config) {
    return { mismatches: [], unmappable: [] };
  }

  const mismatches: FiscalYearDateMismatchItem[] = [];
  const unmappable: FiscalYearDateUnmappableItem[] = [];

  for (const doc of documents) {
    const fiscalYearId = doc.fiscalYearId as string | undefined;
    if (!fiscalYearId) continue;

    const sourceFiscalYear = idToYear.get(fiscalYearId);
    if (sourceFiscalYear === undefined) continue;

    const dateStr = String(doc[config.dateField] ?? '');
    const documentYear = extractCalendarYear(dateStr);
    if (documentYear === null) continue;
    if (documentYear === sourceFiscalYear) continue;

    const label = config.getLabel(doc);
    const targetFiscalYearId = yearToId.get(documentYear);

    if (!targetFiscalYearId) {
      unmappable.push({
        collection,
        documentId: doc.$id,
        label,
        documentDate: dateStr,
        documentYear,
        sourceFiscalYearId: fiscalYearId,
        sourceFiscalYear,
        reason: `No existe ejercicio para el año ${documentYear}`,
      });
      continue;
    }

    mismatches.push({
      collection,
      documentId: doc.$id,
      label,
      documentDate: dateStr,
      documentYear,
      sourceFiscalYearId: fiscalYearId,
      sourceFiscalYear,
      targetFiscalYearId,
      targetFiscalYear: documentYear,
    });
  }

  return { mismatches, unmappable };
}

/**
 * Resume conteos por colección de un informe de desajustes.
 *
 * @param mismatches - lista de desajustes detectados
 */
export function summarizeDateMismatches(
  mismatches: FiscalYearDateMismatchItem[]
): FiscalYearDateMismatchReport['summary'] {
  const summary = {
    invoices: 0,
    entries: 0,
    transactions: 0,
    reservations: 0,
    total: mismatches.length,
  };

  for (const item of mismatches) {
    summary[item.collection] += 1;
  }

  return summary;
}

/**
 * Agrupa desajustes por par origen → destino para mostrar en UI.
 *
 * @param mismatches - lista de desajustes
 */
export function groupMismatchesByRoute(
  mismatches: FiscalYearDateMismatchItem[]
): Array<{ sourceYear: number; targetYear: number; count: number; collections: Record<string, number> }> {
  const groups = new Map<string, { sourceYear: number; targetYear: number; count: number; collections: Record<string, number> }>();

  for (const item of mismatches) {
    const key = `${item.sourceFiscalYear}→${item.targetFiscalYear}`;
    const existing = groups.get(key) ?? {
      sourceYear: item.sourceFiscalYear,
      targetYear: item.targetFiscalYear,
      count: 0,
      collections: {},
    };
    existing.count += 1;
    existing.collections[item.collection] = (existing.collections[item.collection] ?? 0) + 1;
    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}
