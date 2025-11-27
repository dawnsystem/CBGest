/**
 * @fileoverview Centralized logging service
 * @description Provides structured logging with log levels and conditional output
 *              based on environment. Replaces scattered console.log calls.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

// Log level hierarchy (lower number = more verbose)
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Get minimum log level from environment
const getMinLogLevel = (): LogLevel => {
  const env = import.meta.env.MODE;
  // In production, only show warnings and errors
  // In development, show everything
  if (env === 'production') return 'warn';
  return 'debug';
};

// Check if we should log at this level
const shouldLog = (level: LogLevel): boolean => {
  const minLevel = getMinLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
};

// Format log entry for console
const formatLogEntry = (entry: LogEntry): string => {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`;
};

// In-memory log buffer for debugging (keeps last 100 entries)
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 100;

const addToBuffer = (entry: LogEntry): void => {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
};

/**
 * Creates a logger instance for a specific module
 * @param module - Name of the module (e.g., 'AuthService', 'InvoiceHandler')
 */
export const createLogger = (module: string) => {
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data
    };

    // Always add to buffer for debugging
    addToBuffer(entry);

    // Only output to console if level is high enough
    if (!shouldLog(level)) return;

    const formattedMessage = formatLogEntry(entry);

    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.log(formattedMessage, data !== undefined ? data : '');
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.log(formattedMessage, data !== undefined ? data : '');
        break;
      case 'warn':
        console.warn(formattedMessage, data !== undefined ? data : '');
        break;
      case 'error':
        console.error(formattedMessage, data !== undefined ? data : '');
        break;
    }
  };

  return {
    /**
     * Log debug information (only in development)
     */
    debug: (message: string, data?: unknown): void => log('debug', message, data),

    /**
     * Log general information
     */
    info: (message: string, data?: unknown): void => log('info', message, data),

    /**
     * Log warnings
     */
    warn: (message: string, data?: unknown): void => log('warn', message, data),

    /**
     * Log errors
     */
    error: (message: string, data?: unknown): void => log('error', message, data),

    /**
     * Log with emoji prefix for visual distinction
     */
    success: (message: string, data?: unknown): void => log('info', `✅ ${message}`, data),
    loading: (message: string, data?: unknown): void => log('debug', `⏳ ${message}`, data),
    ready: (message: string, data?: unknown): void => log('info', `🟢 ${message}`, data),
    cloud: (message: string, data?: unknown): void => log('debug', `☁️ ${message}`, data)
  };
};

/**
 * Get all buffered log entries (useful for debugging)
 */
export const getLogBuffer = (): LogEntry[] => [...logBuffer];

/**
 * Clear the log buffer
 */
export const clearLogBuffer = (): void => {
  logBuffer.length = 0;
};

/**
 * Export log buffer to JSON (useful for bug reports)
 */
export const exportLogs = (): string => {
  return JSON.stringify(logBuffer, null, 2);
};

// Pre-created loggers for common modules
export const appLogger = createLogger('App');
export const authLogger = createLogger('AuthService');
export const dataLogger = createLogger('DataService');
export const uploadLogger = createLogger('UploadQueue');
export const aiLogger = createLogger('GeminiAI');
