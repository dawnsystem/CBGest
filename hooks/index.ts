/**
 * @fileoverview Hooks personalizados de CBGest
 * @description Re-exporta hooks de diferentes módulos para uso centralizado.
 *
 * APPWRITE FEATURES AVAILABLE:
 * - Realtime subscriptions (implemented in useAppwriteData)
 * - Offline queue (lib/appwrite/offlineQueue.ts)
 * - Rate limiting (lib/appwrite/rateLimiter.ts)
 * - Caching (lib/appwrite/cache.ts)
 *
 * APPWRITE CONSOLE FEATURES TO CREATE:
 * 1. Functions - Para generación de PDF, gastos recurrentes
 * 2. Indexes - Para mejorar queries
 * 3. Webhooks - Para integraciones externas
 */

// Auth hooks - re-export from AuthContext
export { useAuth, useUser, useSessionReady, useAuthState } from '../context/AuthContext';

// Data hooks
export { useAppwriteData } from './useAppwriteData';
export { useDataHandlers } from './useDataHandlers';

// Settings hook
export { useAppSettings } from './useAppSettings';

// Individual entity hooks (for fine-grained control)
export { useInvoices } from './useInvoices';
export { useAccountingEntries } from './useAccountingEntries';
export { useBankTransactions } from './useBankTransactions';
export { useSuppliers } from './useSuppliers';
