/**
 * @fileoverview Tipos para respuestas del análisis documental por IA
 * @description Define interfaces para las respuestas estructuradas (contrato histórico Gemini)
 */

import type { NifType } from '../types';

/**
 * Tipo de NIF para respuestas de IA documental
 * Es equivalente a NifType del sistema principal
 */
export type GeminiNifType = NifType;

/**
 * Tipo de documento (factura)
 */
export type InvoiceType = 'EXPENSE' | 'INCOME';

/**
 * Respuesta del análisis de factura por Gemini
 */
export interface GeminiInvoiceResponse {
  /** Número de factura */
  number: string;
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  /** Nombre o razón social del emisor */
  issuerName: string;
  /** NIF/CIF limpio sin separadores */
  issuerNif: string;
  /** Tipo de identificador fiscal */
  issuerNifType: GeminiNifType;
  /** Domicilio fiscal del emisor */
  issuerAddress: string | null;
  /** Ciudad del emisor */
  issuerCity: string | null;
  /** Código postal del emisor */
  issuerPostalCode: string | null;
  /** País del emisor */
  issuerCountry: string | null;
  /** Nombre del proveedor existente que coincide, o null */
  matchedSupplierId: string | null;
  /** Base imponible */
  baseAmount: number;
  /** Tipo de IVA (ej: 21) */
  vatRate: number;
  /** Importe de IVA */
  vatAmount: number;
  /** Importe total */
  totalAmount: number;
  /** Tipo de factura */
  type: InvoiceType;
  /** Código cuenta contable PGC sugerido (ej: "628") */
  suggestedAccountCode: string;
  /**
   * Concepto breve del documento (alquiler, luz, comisión Booking…).
   * Opcional por compatibilidad con respuestas antiguas / modelos free.
   */
  concept?: string | null;
}

/**
 * Respuesta del análisis de extracto bancario por Gemini
 */
export interface GeminiBankTransaction {
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  /** Concepto o descripción del movimiento */
  concept: string;
  /** Importe (negativo para cargos, positivo para abonos) */
  amount: number;
}

/**
 * Errores comunes de Gemini
 */
export type GeminiErrorType =
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

/**
 * Error estructurado de Gemini
 */
export interface GeminiError {
  type: GeminiErrorType;
  message: string;
  originalError?: unknown;
}

/**
 * Resultado del análisis de factura
 */
export type GeminiInvoiceResult =
  | { success: true; data: GeminiInvoiceResponse }
  | { success: false; error: GeminiError };

/**
 * Resultado del análisis de extracto bancario
 */
export type GeminiBankResult =
  | { success: true; data: GeminiBankTransaction[] }
  | { success: false; error: GeminiError };

/** Alias multi-proveedor del contrato de factura. */
export type InvoiceAiResponse = GeminiInvoiceResponse;

/** Alias multi-proveedor del contrato de movimiento bancario. */
export type BankTransactionAiResponse = GeminiBankTransaction;
