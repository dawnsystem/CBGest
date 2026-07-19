/**
 * @fileoverview Identidad fiscal de la CB (usuario de la app) para prompts y post-proceso IA.
 * Los datos salen de AppSettings: actualizar Settings basta para que la IA “sepa quién eres”.
 */

import type { AppSettings } from '../../types';

/**
 * Contexto mínimo de la CB que opera la app (emisor propio en facturas de ingreso).
 */
export interface CbIssuerContext {
  /** Razón social / denominación (`AppSettings.cbName`). */
  cbName: string;
  /** NIF/CIF de la CB (`AppSettings.nif`). */
  nif: string;
  /** Línea de domicilio opcional para el prompt. */
  addressLine?: string;
}

/**
 * Normaliza un NIF/CIF/VAT para comparación (sin espacios, guiones ni prefijo ES).
 *
 * @param id - Identificador fiscal crudo
 * @returns Id en mayúsculas solo alfanumérico
 * @example
 * normalizeFiscalId('ES B-12345678') // 'B12345678'
 */
export function normalizeFiscalId(id: string): string {
  return String(id || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^ES/, '');
}

/**
 * Normaliza un nombre comercial para comparación flexible.
 *
 * @param name - Razón social o emisor
 * @returns Nombre comparable (sin acentos, forma jurídica genérica)
 */
export function normalizeComparableName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(c\.?\s*b\.?|comunidad\s+de\s+bienes|s\.?l\.?u?\.?|s\.?a\.?|sociedad\s+limitada)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Indica si dos nombres de empresa parecen la misma entidad.
 *
 * @param a - Nombre A
 * @param b - Nombre B
 * @returns true si coinciden o uno contiene al otro (≥3 chars)
 */
export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeComparableName(a);
  const nb = normalizeComparableName(b);
  if (!na || !nb || na.length < 3 || nb.length < 3) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Construye el domicilio en una línea a partir de Settings.
 *
 * @param settings - AppSettings
 * @returns Dirección compacta o undefined
 */
function buildAddressLine(settings: Pick<
  AppSettings,
  'address' | 'streetNumber' | 'postalCode' | 'city' | 'province'
>): string | undefined {
  const parts = [
    [settings.address, settings.streetNumber].filter(Boolean).join(' ').trim(),
    [settings.postalCode, settings.city].filter(Boolean).join(' ').trim(),
    settings.province,
  ].filter((p) => p && String(p).trim());
  if (parts.length === 0) return undefined;
  return parts.join(', ');
}

/**
 * Extrae el contexto de emisor propio desde AppSettings.
 * Si faltan nombre y NIF, devuelve null (prompt genérico).
 *
 * @param settings - Settings de la app (parcial OK)
 * @returns Contexto o null
 * @example
 * cbIssuerFromSettings({ cbName: 'CB Sol', nif: 'E12345678' })
 */
export function cbIssuerFromSettings(
  settings: Pick<
    AppSettings,
    'cbName' | 'nif' | 'address' | 'streetNumber' | 'postalCode' | 'city' | 'province'
  > | null | undefined
): CbIssuerContext | null {
  if (!settings) return null;
  const cbName = String(settings.cbName || '').trim();
  const nif = String(settings.nif || '').trim();
  if (!cbName && !nif) return null;
  return {
    cbName: cbName || 'CB (sin nombre en Settings)',
    nif,
    addressLine: buildAddressLine(settings),
  };
}

/**
 * Indica si el emisor extraído por la IA es la propia CB.
 * Prioriza NIF; si no hay NIF usable, compara razón social.
 *
 * @param issuerName - Nombre emisor del documento
 * @param issuerNif - NIF emisor del documento
 * @param cb - Identidad CB de Settings
 * @returns true si el emisor eres tú
 */
export function isIssuerOwnCb(
  issuerName: string | null | undefined,
  issuerNif: string | null | undefined,
  cb: CbIssuerContext | null | undefined
): boolean {
  if (!cb) return false;
  const docNif = normalizeFiscalId(issuerNif || '');
  const cbNif = normalizeFiscalId(cb.nif);
  if (docNif && cbNif && docNif === cbNif) return true;
  if (cb.cbName && issuerName && namesLikelyMatch(issuerName, cb.cbName)) return true;
  return false;
}
