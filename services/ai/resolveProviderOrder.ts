/**
 * @fileoverview Orden de intento de proveedores según preferencia del usuario.
 */

import type { AiConfig, AiProviderId } from './types';
import { DEFAULT_PROVIDER_ORDER } from './types';

/**
 * Calcula el orden de proveedores a intentar.
 *
 * Si hay preferido concreto, va primero; el resto mantiene el orden por defecto.
 * Con `auto`, se usa DEFAULT_PROVIDER_ORDER.
 *
 * @param config - Configuración de IA
 * @returns Lista ordenada de ids
 * @example
 * resolveProviderOrder({ preferredProvider: 'groq', failoverEnabled: true })
 * // ['groq', 'gemini', 'openrouter']
 */
export function resolveProviderOrder(config: AiConfig): AiProviderId[] {
  const preferred = config.preferredProvider;
  if (preferred === 'auto') {
    return [...DEFAULT_PROVIDER_ORDER];
  }

  const rest = DEFAULT_PROVIDER_ORDER.filter((id) => id !== preferred);
  return [preferred, ...rest];
}
