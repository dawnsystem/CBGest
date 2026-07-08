/**
 * @fileoverview Logger re-export — DEBT-001 consolidation
 * @description The authoritative logger is `services/logger.ts`.
 *              This file exists only for backward compatibility so that any
 *              import of `lib/logger` resolves to the same implementation.
 */
export {
  createLogger,
  createLogger as default,
  getLogBuffer,
  clearLogBuffer,
  exportLogs,
  appLogger,
  authLogger,
  dataLogger,
  uploadLogger,
  aiLogger,
} from '../services/logger';
