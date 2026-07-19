/**
 * @fileoverview Normalización post-IA de tipo y cuenta contable sugerida.
 * Corrige inconsistencias frecuentes de modelos free (p.ej. ingreso de inquilino → 629).
 */

import {
  getAccountByCode,
  isExpenseAccount,
  isIncomeAccount,
} from '../../utils/accountingPlan';
import type { InvoiceAiResponse } from './types';

/** Cuenta por defecto para ingresos por alquiler / prestaciones (CB). */
export const DEFAULT_RENTAL_INCOME_ACCOUNT = '705';

/** Cuenta por defecto para gastos no clasificados. */
export const DEFAULT_EXPENSE_ACCOUNT = '629';

/**
 * Detecta señales de ingreso por alquiler / estancia / inquilino en el texto libre.
 *
 * @param text - Texto a inspeccionar
 * @returns true si parece ingreso de alquiler
 */
export function looksLikeRentalIncome(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\binquilin[oa]s?\b/.test(t) ||
    /\barrendatari[oa]s?\b/.test(t) ||
    /\balquiler\b/.test(t) ||
    /\barrendamiento\b/.test(t) ||
    /\brenta\b/.test(t) ||
    /\bestancia\b/.test(t) ||
    /\balojamiento\b/.test(t) ||
    /\bhu[eé]sped(?:es)?\b/.test(t) ||
    /\breserva\b/.test(t) ||
    /\bnoche(?:s)?\b/.test(t) ||
    /\btourist\b/.test(t) ||
    /\bairbnb\b/.test(t) ||
    /\bbooking\b/.test(t)
  );
}

/**
 * Detecta comisiones de plataformas (gasto), no el ingreso del huésped.
 *
 * @param text - Texto
 * @returns true si parece comisión de plataforma
 */
export function looksLikePlatformCommission(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bcomisi[oó]n(?:es)?\b/.test(t) ||
    /\bservice\s*fee\b/.test(t) ||
    /\bhost\s*fee\b/.test(t) ||
    /\bplatform\s*fee\b/.test(t)
  );
}

/**
 * Detecta gastos operativos claros de la CB (no cobro a inquilino).
 *
 * @param text - Texto
 * @returns true si parece gasto real de CB
 */
export function looksLikeClearCbExpense(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bsuministro(?:s)?\b/.test(t) ||
    /\belectricidad\b/.test(t) ||
    /\bluz\b/.test(t) ||
    /\bagua\b/.test(t) ||
    /\bgas\b/.test(t) ||
    /\bibi\b/.test(t) ||
    /\bcomunidad\b/.test(t) ||
    /\breparaci[oó]n(?:es)?\b/.test(t) ||
    /\bmantenimiento\b/.test(t) ||
    /\blimpieza\b/.test(t) ||
    /\bseguro(?:s)?\b/.test(t) ||
    /\bgestor[ií]a\b/.test(t) ||
    /\bnotari/.test(t) ||
    /\bfontaner/.test(t) ||
    /\belectricista\b/.test(t)
  );
}

/**
 * Une campos textuales de la respuesta IA para heurísticas.
 *
 * @param raw - Respuesta del modelo
 * @returns Blob de texto en minúsculas implícitas vía callers
 */
function buildTextBlob(raw: InvoiceAiResponse): string {
  return [raw.issuerName, raw.concept, raw.number, raw.matchedSupplierId]
    .filter(Boolean)
    .join(' ');
}

/**
 * Normaliza `type` + `suggestedAccountCode` tras la respuesta del modelo.
 *
 * Reglas:
 * 1. Comisión de plataforma → EXPENSE (629 si la cuenta no es de gasto válida).
 * 2. Señal de alquiler/inquilino (y no gasto CB claro) → INCOME + 705.
 * 3. INCOME exige cuenta grupo 7; EXPENSE exige grupo 6.
 * 4. Si la cuenta no existe en el plan → remap según type.
 *
 * @param raw - Respuesta cruda del modelo
 * @returns Respuesta con cuenta/tipo coherentes
 * @example
 * normalizeInvoiceAiResponse({ type: 'EXPENSE', suggestedAccountCode: '629', concept: 'Alquiler marzo', ... })
 * // → type INCOME, suggestedAccountCode '705'
 */
export function normalizeInvoiceAiResponse(raw: InvoiceAiResponse): InvoiceAiResponse {
  const blob = buildTextBlob(raw);

  let type: InvoiceAiResponse['type'] = raw.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  let code = String(raw.suggestedAccountCode || '').trim();

  const platformFee = looksLikePlatformCommission(blob);
  const rentalIncome =
    looksLikeRentalIncome(blob) && !platformFee && !looksLikeClearCbExpense(blob);

  // Comisiones Booking/Airbnb → gasto (nunca 705)
  if (platformFee) {
    type = 'EXPENSE';
    if (!isExpenseAccount(code) || !getAccountByCode(code)) {
      code = DEFAULT_EXPENSE_ACCOUNT;
    }
  } else if (rentalIncome) {
    // Cobro de renta / factura a inquilino mal clasificada como 621/628/629
    type = 'INCOME';
    code = DEFAULT_RENTAL_INCOME_ACCOUNT;
  }

  if (type === 'INCOME') {
    if (!isIncomeAccount(code) || !getAccountByCode(code)) {
      code = DEFAULT_RENTAL_INCOME_ACCOUNT;
    }
  } else if (!isExpenseAccount(code) || !getAccountByCode(code)) {
    code = DEFAULT_EXPENSE_ACCOUNT;
  }

  // Coherencia final tipo ↔ naturaleza de cuenta
  if (type === 'INCOME' && isExpenseAccount(code)) {
    code = DEFAULT_RENTAL_INCOME_ACCOUNT;
  }
  if (type === 'EXPENSE' && isIncomeAccount(code)) {
    code = DEFAULT_EXPENSE_ACCOUNT;
  }

  const concept =
    typeof raw.concept === 'string' && raw.concept.trim()
      ? raw.concept.trim()
      : raw.concept ?? null;

  return {
    ...raw,
    concept,
    type,
    suggestedAccountCode: code,
  };
}
