/**
 * @fileoverview Tipos comunes del router multi-proveedor de IA documental.
 */

import type { GeminiBankTransaction, GeminiInvoiceResponse } from '../../types/gemini';

/** Identificadores de proveedores soportados. */
export type AiProviderId = 'gemini' | 'groq' | 'openrouter';

/** Preferencia de proveedor (incluye selección automática). */
export type AiPreferredProvider = 'auto' | AiProviderId;

/**
 * Configuración de IA persistida en AppSettings.
 */
export interface AiConfig {
  /** Proveedor preferido o `auto` (primer configurado disponible). */
  preferredProvider: AiPreferredProvider;
  /** Si true, rota automáticamente ante cuota/errores de lectura. */
  failoverEnabled: boolean;
}

/** Respuesta normalizada de factura (alias del contrato Gemini histórico). */
export type InvoiceAiResponse = GeminiInvoiceResponse;

/** Movimiento de extracto normalizado. */
export type BankTransactionAiResponse = GeminiBankTransaction;

/**
 * Metadatos del análisis tras el router (proveedor efectivo e intentos).
 */
export interface AiAnalysisMeta {
  /** Proveedor que produjo el resultado. */
  usedProvider: AiProviderId;
  /** Proveedores intentados en orden (incluye el exitoso). */
  attemptedProviders: AiProviderId[];
}

/**
 * Resultado enriquecido de análisis de factura.
 */
export interface InvoiceAnalysisResult {
  data: InvoiceAiResponse;
  meta: AiAnalysisMeta;
}

/**
 * Resultado enriquecido de análisis de extracto bancario.
 */
export interface BankStatementAnalysisResult {
  data: BankTransactionAiResponse[];
  meta: AiAnalysisMeta;
}

/** Configuración por defecto: auto + failover activo. */
export const DEFAULT_AI_CONFIG: AiConfig = {
  preferredProvider: 'auto',
  failoverEnabled: true,
};

/** Orden por defecto cuando preferredProvider es `auto`.
 * OpenRouter antes que Groq: en 2026-07 Groq free ya no lista modelos vision.
 */
export const DEFAULT_PROVIDER_ORDER: AiProviderId[] = ['gemini', 'openrouter', 'groq'];

/** Etiquetas legibles para UI. */
export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq (Llama Vision)',
  openrouter: 'OpenRouter (free VL)',
};
