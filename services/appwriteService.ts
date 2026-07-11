/**
 * @fileoverview Servicios de Appwrite para CBGest — barrel de re-exports
 * @description Mantiene compatibilidad hacia atrás mientras la lógica real vive en
 *   `services/appwrite/*`.
 */

/**
 * @deprecated Import directly from './authService' instead.
 * This re-export exists for backwards compatibility only (DEBT-013).
 */
export { authService } from './authService';

// Infrastructure
export {
  buildMasterDataCopyDocumentId,
  getConnectionHealth,
  setConnectionHealth,
  setNotificationCallbacks,
  initializeAppwrite,
  isAppwriteInitialized,
  testConnection,
  verifyCollections,
  performHealthCheck,
} from './appwrite/infrastructure';

// Specialized domain/integration services
export { storageService } from './appwrite/storageService';
export { realtimeService, subscribeToChanges } from './appwrite/realtimeService';

// Public backwards-compatible API surface
export * from './appwrite/compatService';
export { default } from './appwrite/compatService';
