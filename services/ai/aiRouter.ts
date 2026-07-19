/**
 * @fileoverview Router multi-proveedor con failover ante cuota/errores de lectura.
 */

import type { Supplier } from '../../types';
import { AiProviderError, isFailoverableError } from './errors';
import type { AiDocumentProvider } from './provider';
import { geminiProvider } from './providers/geminiProvider';
import { groqProvider } from './providers/groqProvider';
import { openrouterProvider } from './providers/openrouterProvider';
import { resolveProviderOrder } from './resolveProviderOrder';
import { normalizeInvoiceAiResponse } from './normalizeInvoiceResponse';
import type { CbIssuerContext } from './cbIssuerContext';
import type {
  AiConfig,
  AiProviderId,
  BankStatementAnalysisResult,
  InvoiceAnalysisResult,
} from './types';
import { AI_PROVIDER_LABELS, DEFAULT_AI_CONFIG } from './types';

const PROVIDERS: Record<AiProviderId, AiDocumentProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
};

/**
 * Lista de proveedores registrados (para UI / tests).
 *
 * @returns Proveedores en orden por defecto
 */
export function listAiProviders(): AiDocumentProvider[] {
  return [geminiProvider, groqProvider, openrouterProvider];
}

/**
 * Obtiene el estado de configuración de cada proveedor (sin exponer keys).
 *
 * @returns Mapa id → configurado
 */
export function getAiProviderAvailability(): Record<AiProviderId, boolean> {
  return {
    gemini: geminiProvider.isConfigured(),
    groq: groqProvider.isConfigured(),
    openrouter: openrouterProvider.isConfigured(),
  };
}

interface AttemptFailure {
  providerId: AiProviderId;
  message: string;
}

/**
 * Analiza una factura con failover entre IAs configuradas.
 *
 * @param base64Data - Documento base64
 * @param mimeType - MIME
 * @param existingSuppliers - Proveedores
 * @param aiConfig - Preferencia y failover
 * @returns Datos + meta del proveedor usado
 * @throws Error con detalle de providers intentados si todos fallan
 * @example
 * const { data, meta } = await analyzeInvoiceWithRouter(b64, 'image/jpeg', [], DEFAULT_AI_CONFIG);
 */
export async function analyzeInvoiceWithRouter(
  base64Data: string,
  mimeType: string,
  existingSuppliers: Supplier[] = [],
  aiConfig: AiConfig = DEFAULT_AI_CONFIG,
  cbIssuer: CbIssuerContext | null = null
): Promise<InvoiceAnalysisResult> {
  const result = await runWithFailover(
    aiConfig,
    (provider) =>
      provider.analyzeInvoice(base64Data, mimeType, existingSuppliers, cbIssuer),
    'factura'
  );
  return {
    ...result,
    data: normalizeInvoiceAiResponse(result.data, cbIssuer),
  };
}

/**
 * Analiza un extracto bancario con failover entre IAs configuradas.
 *
 * @param base64Data - Documento base64
 * @param mimeType - MIME
 * @param aiConfig - Preferencia y failover
 * @returns Movimientos + meta
 * @throws Error si todos los proveedores fallan
 */
export async function analyzeBankStatementWithRouter(
  base64Data: string,
  mimeType: string,
  aiConfig: AiConfig = DEFAULT_AI_CONFIG
): Promise<BankStatementAnalysisResult> {
  return runWithFailover(
    aiConfig,
    (provider) => provider.analyzeBankStatement(base64Data, mimeType),
    'extracto'
  );
}

/**
 * Ejecuta el análisis intentando proveedores en cadena.
 *
 * @param aiConfig - Config
 * @param execute - Función por proveedor
 * @param documentLabel - Etiqueta para mensajes de error
 * @returns Resultado con meta
 */
async function runWithFailover<T>(
  aiConfig: AiConfig,
  execute: (provider: AiDocumentProvider) => Promise<T>,
  documentLabel: string
): Promise<{ data: T; meta: { usedProvider: AiProviderId; attemptedProviders: AiProviderId[] } }> {
  const order = resolveProviderOrder(aiConfig);
  const configured = order.filter((id) => PROVIDERS[id].isConfigured());

  if (configured.length === 0) {
    throw new Error(
      'Ninguna API key de IA configurada. Define VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY y/o VITE_OPENROUTER_API_KEY.'
    );
  }

  const attemptedProviders: AiProviderId[] = [];
  const failures: AttemptFailure[] = [];
  const providersToTry = aiConfig.failoverEnabled ? configured : configured.slice(0, 1);

  for (const providerId of providersToTry) {
    const provider = PROVIDERS[providerId];
    attemptedProviders.push(providerId);

    try {
      const data = await execute(provider);
      return {
        data,
        meta: { usedProvider: providerId, attemptedProviders },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : `Error desconocido en ${AI_PROVIDER_LABELS[providerId]}`;
      failures.push({ providerId, message });
      console.warn(
        `[aiRouter] Fallo en ${providerId} (${documentLabel}):`,
        message
      );

      const canFailover =
        aiConfig.failoverEnabled &&
        providersToTry.indexOf(providerId) < providersToTry.length - 1 &&
        isFailoverableError(error);

      if (!canFailover) {
        break;
      }
    }
  }

  const detail = failures
    .map((f) => `${AI_PROVIDER_LABELS[f.providerId]}: ${f.message}`)
    .join(' | ');

  const onlyOneHint =
    configured.length === 1
      ? ' Solo hay un proveedor con API key en este build; añade VITE_GROQ_API_KEY y/o VITE_OPENROUTER_API_KEY (Secrets Cursor o .env.local) y reinicia Vite/redeploy.'
      : '';

  throw new Error(
    `No se pudo analizar el ${documentLabel} con ninguna IA disponible. Intentados: ${attemptedProviders.join(', ')}. ${detail}.${onlyOneHint}`
  );
}

/**
 * Re-export útil para tests.
 */
export { AiProviderError, PROVIDERS };
