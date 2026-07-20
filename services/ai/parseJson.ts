/**
 * @fileoverview Utilidades para parsear JSON de respuestas LLM (con o sin fences).
 */

import { AiProviderError } from './errors';
import type { AiProviderId } from './types';

/**
 * Extrae y parsea JSON desde texto que puede incluir fences markdown.
 *
 * @param text - Respuesta cruda del modelo
 * @param providerId - Proveedor (para errores)
 * @returns Objeto/array parseado
 * @throws AiProviderError PARSE si no es JSON válido
 * @example
 * const data = parseModelJson<{ number: string }>('```json\n{"number":"1"}\n```', 'groq');
 */
export function parseModelJson<T>(text: string, providerId: AiProviderId): T {
  if (!text || !text.trim()) {
    throw new AiProviderError(providerId, 'PARSE', 'Respuesta vacía del modelo de IA.');
  }

  let candidate = text.trim();
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim();
  } else {
    const firstObj = candidate.indexOf('{');
    const firstArr = candidate.indexOf('[');
    let start = -1;
    if (firstObj === -1) start = firstArr;
    else if (firstArr === -1) start = firstObj;
    else start = Math.min(firstObj, firstArr);

    if (start > 0) {
      candidate = candidate.slice(start);
    }

    const lastObj = candidate.lastIndexOf('}');
    const lastArr = candidate.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (end !== -1 && end < candidate.length - 1) {
      candidate = candidate.slice(0, end + 1);
    }
  }

  try {
    return JSON.parse(candidate) as T;
  } catch (error: unknown) {
    throw new AiProviderError(
      providerId,
      'PARSE',
      'No se pudo interpretar la respuesta JSON del modelo.',
      error
    );
  }
}
