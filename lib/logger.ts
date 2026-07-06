/**
 * @fileoverview Sistema de logging estructurado para CBGest
 * @description Proporciona logging consistente con niveles, timestamps y contexto.
 *              Los logs se muestran en consola y pueden ser útiles para debugging.
 */

// ============================================================================
// TIPOS
// ============================================================================

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

/** Nivel mínimo de logs según entorno (producción = WARN, desarrollo = DEBUG) */
const MIN_LOG_LEVEL: LogLevel = import.meta.env?.MODE === 'production'
  ? 'WARN'
  : 'DEBUG';

/** Colores para cada nivel de log */
const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: '#6B7280', // gray
  INFO: '#3B82F6',  // blue
  WARN: '#F59E0B',  // yellow
  ERROR: '#EF4444', // red
};

/** Orden de niveles para filtrado */
const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Verifica si un nivel debe mostrarse según el nivel mínimo configurado
 */
const shouldLog = (level: LogLevel): boolean => {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LOG_LEVEL];
};

/**
 * Formatea un timestamp ISO a formato legible
 */
const formatTimestamp = (): string => {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 23);
};

/**
 * Formatea la entrada de log para consola
 */
const formatLogEntry = (entry: LogEntry): void => {
  const { timestamp, level, module, message, data, error } = entry;
  const color = LEVEL_COLORS[level];

  // Formato: [HH:MM:SS.mmm] [LEVEL] [Module] Message
  const prefix = `%c[${timestamp.slice(11)}] [${level}] [${module}]`;
  const style = `color: ${color}; font-weight: ${level === 'ERROR' ? 'bold' : 'normal'}`;

  if (data && error) {
    console.log(prefix, style, message, data, error);
  } else if (data) {
    console.log(prefix, style, message, data);
  } else if (error) {
    console.log(prefix, style, message, error);
  } else {
    console.log(prefix, style, message);
  }
};

// ============================================================================
// CLASE LOGGER
// ============================================================================

/**
 * Logger para un módulo específico
 */
class ModuleLogger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      module: this.module,
      message,
      data,
      error,
    };

    formatLogEntry(entry);
  }

  /**
   * Log de debug - para información detallada de desarrollo
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', message, data);
  }

  /**
   * Log de info - para operaciones normales importantes
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  /**
   * Log de warning - para situaciones que podrían ser problemáticas
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN', message, data);
  }

  /**
   * Log de error - para errores que necesitan atención
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorData = error && !(error instanceof Error) ? { errorValue: error } : undefined;
    this.log('ERROR', message, { ...data, ...errorData }, errorObj);
  }

  /**
   * Log de inicio de operación
   */
  startOperation(operation: string, data?: Record<string, unknown>): void {
    this.debug(`→ ${operation}`, data);
  }

  /**
   * Log de operación exitosa
   */
  endOperation(operation: string, data?: Record<string, unknown>): void {
    this.debug(`✓ ${operation}`, data);
  }

  /**
   * Log de operación fallida
   */
  failOperation(operation: string, error: unknown, data?: Record<string, unknown>): void {
    this.error(`✗ ${operation}`, error, data);
  }
}

// ============================================================================
// FACTORY Y EXPORT
// ============================================================================

/**
 * Crea un logger para un módulo específico
 *
 * @param module - Nombre del módulo (ej: 'AuthService', 'InvoiceHandler')
 * @returns Logger configurado para el módulo
 *
 * @example
 * const log = createLogger('AuthService');
 * log.info('Usuario autenticado', { userId: '123' });
 * log.error('Error de login', error);
 */
export const createLogger = (module: string): ModuleLogger => {
  return new ModuleLogger(module);
};

/**
 * Loggers pre-creados para módulos comunes
 */
export const loggers = {
  auth: createLogger('Auth'),
  data: createLogger('Data'),
  api: createLogger('API'),
  ui: createLogger('UI'),
  cache: createLogger('Cache'),
  storage: createLogger('Storage'),
  realtime: createLogger('Realtime'),
};

export default createLogger;
