/**
 * @fileoverview Normaliza respuestas de extracto (array o { transactions: [] }).
 */

import { AiProviderError } from './errors';
import type { AiProviderId, BankTransactionAiResponse } from './types';

/**
 * Extrae el array de movimientos desde distintas formas JSON del modelo.
 *
 * @param parsed - JSON ya parseado
 * @param providerId - Proveedor
 * @returns Lista de movimientos
 * @throws AiProviderError PARSE si la forma no es reconocible
 * @example
 * unwrapBankTransactions([{ date: '2024-01-01', concept: 'X', amount: -1 }], 'groq');
 */
export function unwrapBankTransactions(
  parsed: unknown,
  providerId: AiProviderId
): BankTransactionAiResponse[] {
  if (Array.isArray(parsed)) {
    return parsed as BankTransactionAiResponse[];
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['transactions', 'movements', 'items', 'data']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as BankTransactionAiResponse[];
      }
    }
  }

  throw new AiProviderError(
    providerId,
    'PARSE',
    'La respuesta del extracto no contiene un array de transacciones.'
  );
}
