/**
 * @fileoverview Validación de coherencia fecha ↔ ejercicio fiscal activo.
 * @description Guardarraíl estándar (QuickBooks, Xero, Sage): avisar cuando
 *              la fecha del documento no coincide con el ejercicio seleccionado.
 */

/** Resultado de una discrepancia fecha/ejercicio */
export interface FiscalYearDateMismatch {
  documentDate: string;
  documentYear: number;
  activeFiscalYear: number;
  entityLabel: string;
}

/**
 * Extrae el año calendario de una fecha ISO (YYYY-MM-DD).
 *
 * @param dateStr - fecha en formato ISO
 * @returns año numérico o null si la fecha es inválida
 */
export function extractCalendarYear(dateStr: string): number | null {
  if (!dateStr || dateStr.length < 4) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * Detecta si la fecha de un documento pertenece a otro ejercicio fiscal.
 *
 * @param dateStr - fecha del documento (YYYY-MM-DD)
 * @param activeFiscalYear - año del ejercicio activo (ej. 2027)
 * @param entityLabel - etiqueta legible (ej. "factura")
 * @returns detalle del desajuste o null si coincide
 * @example
 * detectFiscalYearDateMismatch('2027-03-15', 2028, 'factura');
 * // { documentDate: '2027-03-15', documentYear: 2027, activeFiscalYear: 2028, ... }
 */
export function detectFiscalYearDateMismatch(
  dateStr: string,
  activeFiscalYear: number | undefined,
  entityLabel = 'documento'
): FiscalYearDateMismatch | null {
  if (!activeFiscalYear) return null;

  const documentYear = extractCalendarYear(dateStr);
  if (documentYear === null) return null;
  if (documentYear === activeFiscalYear) return null;

  return {
    documentDate: dateStr,
    documentYear,
    activeFiscalYear,
    entityLabel,
  };
}

/**
 * Mensaje de confirmación para el usuario ante un desajuste fecha/ejercicio.
 *
 * @param mismatch - detalle del desajuste
 * @returns texto listo para showConfirm
 */
export function formatFiscalYearMismatchMessage(mismatch: FiscalYearDateMismatch): string {
  return (
    `⚠️ La ${mismatch.entityLabel} es del año ${mismatch.documentYear} ` +
    `(fecha: ${mismatch.documentDate}), pero estás trabajando en el ` +
    `Ejercicio ${mismatch.activeFiscalYear}.\n\n` +
    `¿Seguro que quieres guardarla en el ejercicio ${mismatch.activeFiscalYear}? ` +
    `Esto puede provocar errores contables difíciles de corregir.`
  );
}

/**
 * Comprueba un lote de fechas y devuelve el primer desajuste encontrado.
 *
 * @param dates - fechas a comprobar
 * @param activeFiscalYear - año del ejercicio activo
 * @param entityLabel - etiqueta del tipo de documento
 */
export function detectFirstFiscalYearMismatch(
  dates: string[],
  activeFiscalYear: number | undefined,
  entityLabel: string
): FiscalYearDateMismatch | null {
  for (const dateStr of dates) {
    const mismatch = detectFiscalYearDateMismatch(dateStr, activeFiscalYear, entityLabel);
    if (mismatch) return mismatch;
  }
  return null;
}
