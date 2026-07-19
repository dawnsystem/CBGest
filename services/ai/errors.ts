/**
 * @fileoverview Errores tipados y clasificación para failover multi-IA.
 */

import type { AiProviderId } from './types';

/** Códigos de error de proveedor IA. */
export type AiErrorCode =
  | 'QUOTA'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'PARSE'
  | 'TRANSIENT'
  | 'MODEL_NOT_FOUND'
  | 'FATAL';

/**
 * Error estructurado de un proveedor documental.
 *
 * @example
 * throw new AiProviderError('gemini', 'QUOTA', 'Cuota excedida');
 */
export class AiProviderError extends Error {
  readonly providerId: AiProviderId;
  readonly code: AiErrorCode;
  readonly originalError?: unknown;

  /**
   * @param providerId - Proveedor que falló
   * @param code - Código de clasificación
   * @param message - Mensaje legible
   * @param originalError - Error original opcional
   */
  constructor(
    providerId: AiProviderId,
    code: AiErrorCode,
    message: string,
    originalError?: unknown
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.providerId = providerId;
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Indica si el fallo permite intentar el siguiente proveedor.
 *
 * AUTH también permite rotar (key inválida de ese proveedor).
 * Solo FATAL sin más contexto se trata como failoverable para maximizar éxito.
 *
 * @param error - Error desconocido
 * @returns true si el router debe probar el siguiente proveedor
 * @example
 * if (isFailoverableError(err)) continue;
 */
export function isFailoverableError(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return (
      error.code === 'QUOTA' ||
      error.code === 'RATE_LIMIT' ||
      error.code === 'AUTH' ||
      error.code === 'PARSE' ||
      error.code === 'TRANSIENT' ||
      error.code === 'MODEL_NOT_FOUND' ||
      error.code === 'FATAL'
    );
  }
  return true;
}

/**
 * Extrae status HTTP y mensaje de un error desconocido.
 *
 * @param error - Error crudo
 * @returns status y message opcionales
 */
export function getErrorDetails(error: unknown): { message?: string; status?: number } {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const maybeError = error as {
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  const status =
    typeof maybeError.status === 'number'
      ? maybeError.status
      : typeof maybeError.statusCode === 'number'
        ? maybeError.statusCode
        : undefined;

  return {
    message: typeof maybeError.message === 'string' ? maybeError.message : undefined,
    status,
  };
}

/**
 * Clasifica un error HTTP/SDK genérico en AiErrorCode.
 *
 * @param error - Error crudo
 * @param status - Status HTTP opcional (si ya se conoce)
 * @returns Código de error
 * @example
 * classifyHttpError(err, 429) // 'QUOTA' o 'RATE_LIMIT'
 */
export function classifyHttpError(error: unknown, status?: number): AiErrorCode {
  const { message, status: derivedStatus } = getErrorDetails(error);
  const httpStatus = status ?? derivedStatus;
  const lower = (message ?? '').toLowerCase();

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication')
  ) {
    return 'AUTH';
  }

  if (httpStatus === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('rate_limit')) {
    if (lower.includes('quota') || lower.includes('exceeded your current quota')) {
      return 'QUOTA';
    }
    return 'RATE_LIMIT';
  }

  if (httpStatus === 404 || lower.includes('not found') || lower.includes('model')) {
    if (lower.includes('model') || lower.includes('not found')) {
      return 'MODEL_NOT_FOUND';
    }
  }

  if (
    httpStatus !== undefined &&
    httpStatus >= 500
  ) {
    return 'TRANSIENT';
  }

  if (
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  ) {
    return 'TRANSIENT';
  }

  if (lower.includes('json') || lower.includes('parse') || lower.includes('unexpected token')) {
    return 'PARSE';
  }

  return 'FATAL';
}

/**
 * Envuelve un error desconocido como AiProviderError clasificado.
 *
 * @param providerId - Proveedor
 * @param error - Error original
 * @param fallbackMessage - Mensaje si no hay message
 * @returns AiProviderError
 */
export function toProviderError(
  providerId: AiProviderId,
  error: unknown,
  fallbackMessage: string
): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  const { message, status } = getErrorDetails(error);
  const code = classifyHttpError(error, status);
  return new AiProviderError(
    providerId,
    code,
    message || fallbackMessage,
    error
  );
}
