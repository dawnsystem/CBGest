/**
 * @fileoverview Filtro de periodo alineado con ejercicio fiscal (BUG-FILT-001).
 * Prefiere `fiscalYearId` frente al año calendario de la fecha.
 */

export type PeriodFilter = 'month' | 'quarter' | 'year' | 'all';

export interface FiscalPeriodMatchOptions {
  /** fiscalYearId del documento (factura/reserva), si existe */
  fiscalYearId?: string;
  /** Fecha del documento en YYYY-MM-DD (o parseable) */
  dateStr: string;
  /** ID del ejercicio activo */
  activeFiscalYearId?: string;
  /** Año numérico del ejercicio activo (fallback legacy) */
  activeYear: number;
  /** Periodo UI seleccionado */
  periodFilter: PeriodFilter;
  /** Ancla para mes/trimestre actuales (inyectable en tests) */
  referenceDate?: Date;
}

/**
 * Indica si un documento pertenece al periodo del ejercicio activo.
 * - Con `fiscalYearId` en ambos lados: empareja por ID (no por año de fecha).
 * - Sin `fiscalYearId`: fallback al año calendario de la fecha.
 * - `periodFilter === 'all'`: siempre true (comportamiento histórico).
 *
 * @param options - Criterios de filtro
 * @returns true si el documento entra en el periodo
 * @example
 * matchesActiveFiscalPeriod({
 *   fiscalYearId: 'fy-2026',
 *   dateStr: '2025-12-15',
 *   activeFiscalYearId: 'fy-2026',
 *   activeYear: 2026,
 *   periodFilter: 'year',
 * }); // true — fecha fuera del calendario pero mismo ejercicio
 */
export function matchesActiveFiscalPeriod(options: FiscalPeriodMatchOptions): boolean {
  const {
    fiscalYearId,
    dateStr,
    activeFiscalYearId,
    activeYear,
    periodFilter,
    referenceDate = new Date(),
  } = options;

  if (periodFilter === 'all') {
    return true;
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const month = date.getMonth();
  const quarter = Math.floor(month / 3);
  const currentMonth = referenceDate.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);

  let inYear: boolean;
  if (activeFiscalYearId && fiscalYearId) {
    inYear = fiscalYearId === activeFiscalYearId;
  } else {
    inYear = date.getFullYear() === activeYear;
  }

  if (!inYear) {
    return false;
  }

  switch (periodFilter) {
    case 'month':
      return month === currentMonth;
    case 'quarter':
      return quarter === currentQuarter;
    case 'year':
      return true;
    default:
      return true;
  }
}

/**
 * Indica si una factura entra en el chart del Dashboard del ejercicio activo.
 * Con fiscalYearId: solo exige match de ID. Sin él: fallback a año calendario.
 *
 * @param invFiscalYearId - fiscalYearId de la factura
 * @param invDate - fecha factura
 * @param selectedFiscalYearId - ejercicio activo
 * @param selectedYear - año del ejercicio (fallback)
 * @returns true si debe incluirse en el chart
 */
export function matchesDashboardFiscalYear(
  invFiscalYearId: string | undefined,
  invDate: string,
  selectedFiscalYearId: string | undefined,
  selectedYear: number | undefined
): boolean {
  if (selectedFiscalYearId) {
    if (invFiscalYearId) {
      return invFiscalYearId === selectedFiscalYearId;
    }
    if (selectedYear == null) return true;
    const date = new Date(invDate);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === selectedYear;
  }
  if (selectedYear == null) return true;
  const date = new Date(invDate);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === selectedYear;
}
