/**
 * @fileoverview Utilidades para la gestión de períodos de vigencia de la tasa turística.
 *
 * La tasa turística (IEET - Impost sobre Estades en Establiments Turístics) puede cambiar
 * de tarifa dentro de un mismo ejercicio por decreto de la Generalitat de Catalunya.
 * Este módulo gestiona esos períodos y determina qué configuración aplica a una fecha dada.
 */

import type { FiscalYear, TouristTaxConfig, TouristTaxPeriod } from '../types';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';
import { generateId } from './defaults';

// ============================================================================
// SERIALIZACIÓN / DESERIALIZACIÓN
// ============================================================================

/**
 * Parsea el JSON de períodos almacenado en FiscalYear.touristTaxPeriods.
 * Devuelve array vacío si el valor es nulo, vacío o inválido.
 *
 * @param json - String JSON procedente de Appwrite, o undefined
 * @returns Array de TouristTaxPeriod (puede ser vacío)
 */
export function parseTouristTaxPeriods(json: string | undefined): TouristTaxPeriod[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as TouristTaxPeriod[];
  } catch {
    console.warn('[touristTaxUtils] parseTouristTaxPeriods: JSON inválido, devolviendo []');
    return [];
  }
}

/**
 * Serializa un array de TouristTaxPeriod a JSON string para guardar en Appwrite.
 *
 * @param periods - Array de períodos de vigencia
 * @returns JSON string
 */
export function serializeTouristTaxPeriods(periods: TouristTaxPeriod[]): string {
  return JSON.stringify(periods);
}

// ============================================================================
// SELECCIÓN DE PERÍODO ACTIVO
// ============================================================================

/**
 * Devuelve el período de vigencia activo en una fecha concreta.
 *
 * Criterio de prioridad:
 * 1. El período cuyo startDate ≤ date y (endDate ≥ date || !endDate).
 * 2. Si hay varios candidatos (no debería ocurrir con validación), gana el de startDate más tardío.
 *
 * @param periods - Array de períodos del ejercicio
 * @param date    - Fecha ISO YYYY-MM-DD a evaluar
 * @returns El TouristTaxPeriod activo, o null si no hay ninguno
 *
 * @example
 * const period = getActivePeriodForDate(periods, '2025-09-15');
 */
export function getActivePeriodForDate(
  periods: TouristTaxPeriod[],
  date: string
): TouristTaxPeriod | null {
  if (!periods.length) return null;

  // Normalizar a YYYY-MM-DD para comparación lexicográfica segura
  const targetDate = date.substring(0, 10);

  const candidates = periods.filter(p => {
    if (p.startDate > targetDate) return false;
    if (p.endDate && p.endDate < targetDate) return false;
    return true;
  });

  if (!candidates.length) return null;

  // En caso de solapamiento (no debería ocurrir con buena validación de UI),
  // aplicar el criterio de que el más tardío en iniciar tiene precedencia.
  return candidates.reduce((best, c) => (c.startDate > best.startDate ? c : best));
}

// ============================================================================
// OBTENER PERÍODOS DE UN EJERCICIO (CON FALLBACK)
// ============================================================================

/**
 * Obtiene los períodos de vigencia de la tasa turística para un ejercicio dado.
 *
 * Si el ejercicio tiene períodos definidos (touristTaxPeriods), los devuelve.
 * Si no, crea un único período "por defecto" desde el 1 de enero del ejercicio
 * usando la configuración global (AppSettings.touristTaxConfig) como fallback.
 * Esto garantiza retrocompatibilidad con ejercicios creados antes de esta feature.
 *
 * @param fiscalYear - El ejercicio contable
 * @param fallback   - Configuración global (AppSettings.touristTaxConfig) usada como fallback
 * @returns Array de TouristTaxPeriod siempre con al menos un elemento
 *
 * @example
 * const periods = getPeriodsForFiscalYear(activeFiscalYear, settings.touristTaxConfig);
 */
export function getPeriodsForFiscalYear(
  fiscalYear: FiscalYear,
  fallback?: TouristTaxConfig | null
): TouristTaxPeriod[] {
  const parsed = parseTouristTaxPeriods(fiscalYear.touristTaxPeriods);
  if (parsed.length > 0) return parsed;

  // Fallback: crear un período sintético desde el inicio del ejercicio
  const base = fallback ?? DEFAULT_TAX_CONFIG;
  return [createDefaultPeriodForYear(fiscalYear.year, base)];
}

// ============================================================================
// HELPERS DE CREACIÓN
// ============================================================================

/**
 * Crea un TouristTaxPeriod "de arranque" para un ejercicio, copiando los valores
 * de una TouristTaxConfig existente.
 *
 * @param year   - Año del ejercicio (ej: 2025)
 * @param config - Configuración base a copiar
 * @returns TouristTaxPeriod desde el 1 de enero del año, sin fecha fin
 */
export function createDefaultPeriodForYear(
  year: number,
  config: TouristTaxConfig
): TouristTaxPeriod {
  return {
    id: generateId(),
    startDate: `${year}-01-01`,
    endDate: undefined,
    rate: config.rate,
    maxNights: config.maxNights,
    minAge: config.minAge,
    enabled: config.enabled,
    notes: 'Período inicial del ejercicio'
  };
}

// ============================================================================
// VALIDACIÓN
// ============================================================================

/**
 * Verifica si un nuevo período solapa con los existentes.
 *
 * @param newPeriod      - El período a añadir (sin id)
 * @param existingPeriods - Períodos ya configurados para el ejercicio
 * @param excludeId      - ID a excluir de la comprobación (para edición in-place)
 * @returns true si hay solapamiento
 *
 * @example
 * if (hasOverlap(draft, periods)) { show error }
 */
export function hasOverlap(
  newPeriod: Pick<TouristTaxPeriod, 'startDate' | 'endDate'>,
  existingPeriods: TouristTaxPeriod[],
  excludeId?: string
): boolean {
  const ns = newPeriod.startDate;
  // Si no hay endDate, el período es "abierto" (hasta el fin del ejercicio)
  const ne = newPeriod.endDate ?? '9999-12-31';

  return existingPeriods
    .filter(p => p.id !== excludeId)
    .some(p => {
      const ps = p.startDate;
      const pe = p.endDate ?? '9999-12-31';
      // Solapan si no se da ninguna de: [ne < ps] ni [ns > pe]
      return !(ne < ps || ns > pe);
    });
}

/**
 * Ordena los períodos cronológicamente por startDate (ascendente).
 *
 * @param periods - Array de períodos
 * @returns Nuevo array ordenado (no muta el original)
 */
export function sortPeriodsByDate(periods: TouristTaxPeriod[]): TouristTaxPeriod[] {
  return [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ============================================================================
// FILTRO SEMESTRAL IEET (límites como YYYY-MM-DD)
// ============================================================================

export type IeetSemester = 1 | 2;

export interface SemesterDateBounds {
  /** Inclusive start date as YYYY-MM-DD (1-ene or 1-jul). */
  start: string;
  /** Inclusive end date as YYYY-MM-DD (30-jun or 31-dic). */
  end: string;
}

/**
 * Devuelve los límites inclusivos de un semestre IEET como strings YYYY-MM-DD.
 *
 * IEET-001: se usan strings de calendario (no `Date`) para evitar el desfase
 * entre `new Date(year, month, day)` (local) y `new Date('YYYY-MM-DD')` (UTC).
 *
 * @param year - Año civil del semestre
 * @param semester - 1 = ene–jun, 2 = jul–dic
 * @returns Límites inclusivos `{ start, end }`
 *
 * @example
 * getSemesterDateBounds(2026, 1) // { start: '2026-01-01', end: '2026-06-30' }
 * getSemesterDateBounds(2026, 2) // { start: '2026-07-01', end: '2026-12-31' }
 */
export function getSemesterDateBounds(year: number, semester: IeetSemester): SemesterDateBounds {
  if (semester === 1) {
    return { start: `${year}-01-01`, end: `${year}-06-30` };
  }
  return { start: `${year}-07-01`, end: `${year}-12-31` };
}

/**
 * Indica si una fecha ISO (o YYYY-MM-DD) cae dentro del semestre IEET indicado.
 *
 * Compara solo la parte de calendario `YYYY-MM-DD` (substring 0..10), el mismo
 * patrón que `areDatesConsecutive` tras BUG-003 / IEET-001.
 *
 * @param dateStr - Fecha ISO o `YYYY-MM-DD` (p. ej. check-in de reserva)
 * @param year - Año civil del semestre
 * @param semester - 1 = ene–jun, 2 = jul–dic
 * @returns `true` si la fecha está dentro del semestre (inclusive)
 * @throws Never — fechas vacías o malformadas devuelven `false`
 *
 * @example
 * isDateInSemester('2026-07-01', 2026, 2) // true (límite inferior semestre 2)
 * isDateInSemester('2026-07-01', 2026, 1) // false
 * isDateInSemester('2026-01-01T00:00:00.000Z', 2026, 1) // true
 */
export function isDateInSemester(
  dateStr: string | undefined | null,
  year: number,
  semester: IeetSemester
): boolean {
  if (!dateStr) return false;
  const day = dateStr.substring(0, 10);
  // Guardrail: must look like YYYY-MM-DD for lexicographic compare to be safe
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const { start, end } = getSemesterDateBounds(year, semester);
  return day >= start && day <= end;
}
