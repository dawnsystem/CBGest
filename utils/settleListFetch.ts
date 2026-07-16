/**
 * @fileoverview Helper para Promise.all de listados Appwrite sin ocultar fallos.
 * @description Los `.catch(() => [])` silenciosos hacen que un error de query
 *              (p.ej. índice fiscalYearId ausente) se vea como "datos vacíos".
 */

/**
 * Resultado de una carga de lista con error opcional preservado.
 */
export interface SettledListResult<T> {
  data: T[];
  error?: string;
}

/**
 * Ejecuta un fetch de lista y, si falla, devuelve `[]` + mensaje de error.
 * No lanza: pensado para `Promise.all` de cargas parciales.
 *
 * @param promise - Promesa que resuelve a un array
 * @param label - Nombre legible de la colección (p.ej. "facturas")
 * @returns Datos (o []) y error opcional
 * @example
 * const invoices = await settleListFetch(fetchInvoices(fyId), 'facturas');
 * if (invoices.error) console.warn(invoices.error);
 */
export async function settleListFetch<T>(
  promise: Promise<T[]>,
  label: string
): Promise<SettledListResult<T>> {
  try {
    const data = await promise;
    return { data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to fetch ${label}:`, error);
    return { data: [], error: `${label}: ${message}` };
  }
}

/**
 * Agrega errores de varios SettledListResult en un único mensaje.
 *
 * @param results - Resultados con error opcional
 * @returns Mensaje combinado o null si no hay errores
 */
export function collectFetchErrors(
  results: Array<{ error?: string }>
): string | null {
  const errors = results.map((r) => r.error).filter((e): e is string => Boolean(e));
  if (errors.length === 0) return null;
  return `Error al obtener datos de Appwrite (${errors.length}): ${errors.join('; ')}`;
}
