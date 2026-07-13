/**
 * @fileoverview Utilidades para la gestión de períodos de vigencia de la tasa turística.
 *
 * La tasa turística (IEET - Impost sobre Estades en Establiments Turístics) puede cambiar
 * de tarifa dentro de un mismo ejercicio por decreto de la Generalitat de Catalunya.
 * Este módulo gestiona esos períodos y determina qué configuración aplica a una fecha dada.
 */

import { ID } from 'appwrite';
import type { FiscalYear, TouristTaxConfig, TouristTaxPeriod } from '../types';
import { DEFAULT_TAX_CONFIG } from '../config/defaultSettings';

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
    id: ID.unique(),
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
