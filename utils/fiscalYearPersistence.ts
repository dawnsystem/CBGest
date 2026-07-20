/**
 * @fileoverview Persistencia del ejercicio fiscal activo por usuario.
 * @description Patrón "workspace context" (estándar SaaS multi-tenant):
 *              recordar el último contexto usado, no el último creado.
 */

import type { FiscalYear } from '../types';

/** Preferencia persistida del ejercicio activo */
export interface StoredFiscalYearPreference {
  id: string;
  year: number;
  lastUsedAt: string;
}

const LEGACY_LS_KEY = 'gestcb_active_fiscal_year_id';

/**
 * Clave de localStorage por usuario (sobrevive al logout).
 * @param userId - ID del usuario autenticado
 * @returns clave `gestcb_active_fy_<userId>`
 */
export function getFiscalYearStorageKey(userId: string): string {
  return `gestcb_active_fy_${userId}`;
}

/**
 * Indica si una clave de localStorage guarda preferencia de ejercicio fiscal.
 * @param key - clave a comprobar
 */
export function isFiscalYearStorageKey(key: string): boolean {
  return key === LEGACY_LS_KEY || key.startsWith('gestcb_active_fy_');
}

/**
 * Carga la preferencia guardada para un usuario.
 * Migra automáticamente la clave legacy `gestcb_active_fiscal_year_id`.
 *
 * @param userId - ID del usuario
 * @returns preferencia o null si no hay ninguna válida
 */
export function loadStoredFiscalYearPreference(userId: string): StoredFiscalYearPreference | null {
  const userKey = getFiscalYearStorageKey(userId);
  const raw = localStorage.getItem(userKey) ?? localStorage.getItem(LEGACY_LS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredFiscalYearPreference;
    if (parsed?.id && typeof parsed.year === 'number') {
      return parsed;
    }
  } catch {
    // Legacy: solo ID en texto plano
    const legacyId = raw.trim();
    if (legacyId) {
      return { id: legacyId, year: 0, lastUsedAt: new Date().toISOString() };
    }
  }

  return null;
}

/**
 * Persiste el ejercicio activo del usuario con marca temporal de uso.
 *
 * @param userId - ID del usuario
 * @param fiscalYear - ejercicio seleccionado
 */
export function saveStoredFiscalYearPreference(userId: string, fiscalYear: FiscalYear): void {
  const preference: StoredFiscalYearPreference = {
    id: fiscalYear.id,
    year: fiscalYear.year,
    lastUsedAt: new Date().toISOString(),
  };
  localStorage.setItem(getFiscalYearStorageKey(userId), JSON.stringify(preference));
  localStorage.removeItem(LEGACY_LS_KEY);
}

/**
 * Resuelve el ejercicio a activar según preferencia guardada.
 * Prioridad: ID exacto → año calendario → null (requiere selección explícita).
 *
 * @param years - ejercicios disponibles (orden descendente por año)
 * @param userId - ID del usuario
 * @returns ejercicio resuelto o null
 */
export function resolveFiscalYearFromPreference(
  years: FiscalYear[],
  userId: string
): FiscalYear | null {
  const stored = loadStoredFiscalYearPreference(userId);
  if (!stored) return null;

  const byId = years.find(
    (y) => y.id === stored.id || y.appwriteId === stored.id
  );
  if (byId) return byId;

  if (stored.year > 0) {
    const byYear = years.find((y) => y.year === stored.year);
    if (byYear) return byYear;
  }

  return null;
}
