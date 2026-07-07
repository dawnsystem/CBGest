/**
 * @fileoverview Mensajes de error centralizados en español
 * @description Proporciona mensajes de error legibles para el usuario.
 *              Centraliza la traducción de errores de Appwrite y otros.
 */

import { AppwriteException } from 'appwrite';

// ============================================================================
// TIPOS
// ============================================================================

export type ErrorCategory =
  | 'AUTH'
  | 'NETWORK'
  | 'PERMISSION'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'UNKNOWN';

export interface ParsedError {
  message: string;        // Mensaje para mostrar al usuario
  category: ErrorCategory;
  code?: number;          // Código HTTP si aplica
  technical?: string;     // Mensaje técnico para logs
  recoverable: boolean;   // Si el usuario puede reintentar
  action?: string;        // Acción sugerida al usuario
}

// ============================================================================
// MENSAJES POR CÓDIGO DE ERROR
// ============================================================================

const ERROR_MESSAGES: Record<number, Omit<ParsedError, 'code' | 'technical'>> = {
  // Errores de autenticación
  401: {
    message: 'Sesión expirada o credenciales incorrectas',
    category: 'AUTH',
    recoverable: true,
    action: 'Por favor, inicia sesión de nuevo',
  },
  403: {
    message: 'No tienes permiso para realizar esta acción',
    category: 'PERMISSION',
    recoverable: false,
    action: 'Contacta con el administrador si crees que es un error',
  },
  404: {
    message: 'El recurso solicitado no existe',
    category: 'NOT_FOUND',
    recoverable: false,
    action: 'Verifica que el elemento existe',
  },
  409: {
    message: 'Ya existe un recurso con esos datos',
    category: 'CONFLICT',
    recoverable: false,
    action: 'Intenta con datos diferentes',
  },
  429: {
    message: 'Demasiadas solicitudes. Por favor, espera unos segundos',
    category: 'RATE_LIMIT',
    recoverable: true,
    action: 'Espera unos segundos e inténtalo de nuevo',
  },
  500: {
    message: 'Error en el servidor. Inténtalo más tarde',
    category: 'SERVER',
    recoverable: true,
    action: 'Espera unos minutos e inténtalo de nuevo',
  },
  503: {
    message: 'Servicio temporalmente no disponible',
    category: 'SERVER',
    recoverable: true,
    action: 'Espera unos minutos e inténtalo de nuevo',
  },
};

// ============================================================================
// MENSAJES POR TIPO DE ERROR DE APPWRITE
// ============================================================================

const APPWRITE_ERROR_MESSAGES: Record<string, string> = {
  // Autenticación
  'user_already_exists': 'Ya existe una cuenta con ese email',
  'user_invalid_credentials': 'Email o contraseña incorrectos',
  'user_blocked': 'Tu cuenta ha sido bloqueada. Contacta con soporte',
  'user_invalid_token': 'El enlace ha expirado. Solicita uno nuevo',
  'user_password_mismatch': 'Las contraseñas no coinciden',
  'user_session_not_found': 'Sesión no encontrada. Inicia sesión de nuevo',

  // Documentos
  'document_not_found': 'El documento no existe o fue eliminado',
  'document_already_exists': 'Ya existe un documento con ese ID',
  'document_invalid_structure': 'Los datos del documento no son válidos',

  // Colecciones
  'collection_not_found': 'La colección no existe. Contacta con soporte',
  'attribute_not_found': 'Campo no encontrado en la colección',

  // Storage
  'storage_file_not_found': 'El archivo no existe o fue eliminado',
  'storage_invalid_file': 'El archivo no es válido',
  'storage_file_empty': 'El archivo está vacío',
  'storage_invalid_file_size': 'El archivo es demasiado grande',

  // General
  'general_unknown': 'Error desconocido. Inténtalo de nuevo',
  'general_rate_limit_exceeded': 'Demasiadas solicitudes. Espera un momento',
  'general_unauthorized_scope': 'No tienes permisos para esta operación',
};

// ============================================================================
// FUNCIÓN PRINCIPAL DE PARSEO
// ============================================================================

/**
 * Parsea cualquier error y devuelve un objeto estructurado con información útil.
 *
 * @param error - El error a parsear (puede ser cualquier tipo)
 * @returns Objeto ParsedError con información estructurada
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const parsed = parseError(error);
 *   showNotification(parsed.message);
 *   if (parsed.recoverable) {
 *     showRetryButton();
 *   }
 * }
 */
export const parseError = (error: unknown): ParsedError => {
  // Error de Appwrite
  if (error instanceof AppwriteException) {
    return parseAppwriteError(error);
  }

  // Error de red (fetch)
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return {
      message: 'Sin conexión a internet',
      category: 'NETWORK',
      recoverable: true,
      action: 'Verifica tu conexión e inténtalo de nuevo',
      technical: 'Network request failed',
    };
  }

  // Error estándar de JavaScript
  if (error instanceof Error) {
    return parseStandardError(error);
  }

  // Error desconocido
  return {
    message: 'Ha ocurrido un error inesperado',
    category: 'UNKNOWN',
    recoverable: true,
    action: 'Inténtalo de nuevo',
    technical: String(error),
  };
};

/**
 * Parsea un error de Appwrite
 */
const parseAppwriteError = (error: AppwriteException): ParsedError => {
  const code = error.code;
  const type = error.type;

  // Primero buscar por tipo específico de Appwrite
  if (type && APPWRITE_ERROR_MESSAGES[type]) {
    return {
      message: APPWRITE_ERROR_MESSAGES[type],
      category: getCategory(code),
      code,
      recoverable: isRecoverable(code),
      action: ERROR_MESSAGES[code]?.action,
      technical: `${type}: ${error.message}`,
    };
  }

  // Luego buscar por código HTTP
  if (ERROR_MESSAGES[code]) {
    const preset = ERROR_MESSAGES[code];
    return {
      ...preset,
      code,
      technical: error.message,
    };
  }

  // Fallback
  return {
    message: error.message || 'Error del servidor',
    category: getCategory(code),
    code,
    recoverable: isRecoverable(code),
    technical: error.message,
  };
};

/**
 * Parsea un error estándar de JavaScript
 */
const parseStandardError = (error: Error): ParsedError => {
  // Errores de red comunes
  if (error.message.includes('network') || error.message.includes('Network')) {
    return {
      message: 'Error de conexión',
      category: 'NETWORK',
      recoverable: true,
      action: 'Verifica tu conexión e inténtalo de nuevo',
      technical: error.stack || error.message,
    };
  }

  // Errores de timeout
  if (error.message.includes('timeout') || error.message.includes('Timeout')) {
    return {
      message: 'La operación tardó demasiado',
      category: 'NETWORK',
      recoverable: true,
      action: 'Inténtalo de nuevo',
      technical: error.stack || error.message,
    };
  }

  return {
    message: error.message || 'Error inesperado',
    category: 'UNKNOWN',
    recoverable: true,
    action: 'Inténtalo de nuevo',
    technical: error.stack || error.message,
  };
};

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Determina la categoría de error basada en el código HTTP
 */
const getCategory = (code: number): ErrorCategory => {
  if (code === 401) return 'AUTH';
  if (code === 403) return 'PERMISSION';
  if (code === 404) return 'NOT_FOUND';
  if (code === 409) return 'CONFLICT';
  if (code === 429) return 'RATE_LIMIT';
  if (code >= 500) return 'SERVER';
  if (code >= 400) return 'VALIDATION';
  return 'UNKNOWN';
};

/**
 * Determina si un error es recuperable basado en el código
 */
const isRecoverable = (code: number): boolean => {
  // No recuperables: 403 (permisos), 404 (no existe), 409 (conflicto)
  const nonRecoverable = [403, 404, 409];
  return !nonRecoverable.includes(code);
};

// ============================================================================
// MENSAJES DE OPERACIÓN ESPECÍFICOS
// ============================================================================

/**
 * Genera un mensaje de error contextualizado para una operación específica
 *
 * @param operation - Nombre de la operación (ej: 'guardar factura')
 * @param error - El error original
 * @returns Mensaje de error contextualizado
 */
export const getOperationErrorMessage = (operation: string, error: unknown): string => {
  const parsed = parseError(error);

  // Mensajes contextualizados según la operación
  const contextMessages: Record<ErrorCategory, string> = {
    AUTH: `No se pudo ${operation}: sesión expirada`,
    NETWORK: `No se pudo ${operation}: sin conexión`,
    PERMISSION: `No tienes permiso para ${operation}`,
    VALIDATION: `Datos inválidos al ${operation}`,
    NOT_FOUND: `No se encontró el elemento al ${operation}`,
    CONFLICT: `Conflicto al ${operation}: ya existe`,
    RATE_LIMIT: `Demasiadas solicitudes. Espera para ${operation}`,
    SERVER: `Error del servidor al ${operation}`,
    UNKNOWN: `Error al ${operation}`,
  };

  return contextMessages[parsed.category];
};

export default parseError;
