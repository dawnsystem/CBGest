/**
 * @fileoverview Utilidades de deduplicación de facturas (hash de archivo + huella fiscal).
 */

import { normalizeNif } from './validators';
import type { DuplicateMatch, Invoice, InvoiceDuplicateSummary } from '../types';
import { computeFileSha256 as computeFileSha256FromFingerprint } from './bankStatementFingerprint';

/**
 * Calcula SHA-256 hex de un archivo/blob en el navegador.
 * Delega en la utilidad compartida de fingerprint (con guarda SubtleCrypto).
 *
 * @param file - Archivo o blob a hashear
 * @returns Hash hexadecimal en minúsculas (64 caracteres)
 * @throws When Web Crypto SubtleCrypto is unavailable in the current environment
 * @example
 * const hash = await computeFileSha256(pdfFile);
 */
export async function computeFileSha256(file: Blob): Promise<string> {
  return computeFileSha256FromFingerprint(file);
}

/**
 * Normaliza el número de factura para comparación canónica.
 *
 * @param number - Número tal como aparece en el documento
 * @returns Número en mayúsculas sin separadores
 */
export function normalizeInvoiceNumber(number: string): string {
  if (!number) return '';
  return number.trim().toUpperCase().replace(/[\s\-_/\\.]/g, '');
}

/**
 * Convierte un importe a céntimos enteros (evita errores de float).
 *
 * @param amount - Importe en euros
 * @returns Importe en céntimos
 */
export function amountToCents(amount: number): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/**
 * Construye la huella fiscal canónica de una factura.
 *
 * @param input - Campos mínimos del documento
 * @returns Cadena `nif|number|date|cents`
 */
export function buildContentFingerprint(
  input: Pick<Invoice, 'issuerNif' | 'number' | 'date' | 'totalAmount'>
): string {
  const nif = normalizeNif(input.issuerNif || '');
  const number = normalizeInvoiceNumber(input.number || '');
  const date = (input.date || '').trim();
  const cents = amountToCents(input.totalAmount ?? 0);
  return `${nif}|${number}|${date}|${cents}`;
}

/**
 * Resumen legible de una factura para avisos de duplicado.
 *
 * @param invoice - Factura existente
 */
export function buildDuplicateSummary(
  invoice: Pick<Invoice, 'number' | 'issuerName' | 'date' | 'totalAmount'>
): InvoiceDuplicateSummary {
  return {
    number: invoice.number,
    issuerName: invoice.issuerName,
    date: invoice.date,
    totalAmount: invoice.totalAmount,
  };
}

/**
 * Mensaje de confirmación cuando se detecta un posible duplicado.
 *
 * @param match - Coincidencia detectada
 */
export function formatDuplicateConfirmMessage(match: DuplicateMatch): string {
  const { summary, kind } = match;
  const kindLabel = kind === 'FILE'
    ? 'el mismo archivo ya fue subido'
    : 'una factura con los mismos datos fiscales ya existe';
  return `Posible duplicado: ${kindLabel} (${summary.issuerName}, nº ${summary.number}, ${summary.date}, ${summary.totalAmount.toFixed(2)} €). ¿Guardar igualmente?`;
}

/**
 * Comprueba si la factura pertenece al ejercicio activo (si se especifica).
 */
function matchesFiscalYear(invoice: Invoice, fiscalYearId?: string | null): boolean {
  if (!fiscalYearId) return true;
  if (!invoice.fiscalYearId) return true;
  return invoice.fiscalYearId === fiscalYearId;
}

/**
 * Busca duplicado por hash de archivo en una lista en memoria.
 *
 * @param invoices - Facturas cargadas
 * @param fileHash - SHA-256 del archivo
 * @param fiscalYearId - Ejercicio activo (opcional)
 */
export function findDuplicateByFileHash(
  invoices: Invoice[],
  fileHash: string,
  fiscalYearId?: string | null
): Invoice | undefined {
  if (!fileHash) return undefined;
  return invoices.find(
    (inv) => inv.fileHash === fileHash && matchesFiscalYear(inv, fiscalYearId)
  );
}

/**
 * Busca duplicado por huella fiscal en una lista en memoria.
 *
 * @param invoices - Facturas cargadas
 * @param fingerprint - Huella canónica
 * @param fiscalYearId - Ejercicio activo (opcional)
 */
export function findDuplicateByContentFingerprint(
  invoices: Invoice[],
  fingerprint: string,
  fiscalYearId?: string | null
): Invoice | undefined {
  if (!fingerprint) return undefined;
  return invoices.find((inv) => {
    if (!matchesFiscalYear(inv, fiscalYearId)) return false;
    const fp = inv.contentFingerprint || buildContentFingerprint(inv);
    return fp === fingerprint;
  });
}

/**
 * Crea un objeto DuplicateMatch a partir de una factura existente.
 *
 * @param existing - Factura ya registrada
 * @param kind - Tipo de coincidencia
 */
export function toDuplicateMatch(
  existing: Invoice,
  kind: DuplicateMatch['kind']
): DuplicateMatch {
  return {
    kind,
    existingInvoiceId: existing.id,
    summary: buildDuplicateSummary(existing),
  };
}
