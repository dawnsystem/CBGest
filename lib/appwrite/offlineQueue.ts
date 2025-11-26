/**
 * @fileoverview Stub de offline queue - funcionalidad offline eliminada
 * @description La app es completamente online. Sin conexión a Appwrite, no funciona.
 * Este archivo se mantiene por compatibilidad con la interfaz existente.
 */

/**
 * Stats interface for ConnectionStatus component
 */
export interface OfflineQueueStats {
  pendingOperations: number;
  isOnline: boolean;
  isSyncing: boolean;
  oldestOperation: string | null;
}

/**
 * Empty offline queue stats - app is always online
 */
export const getOfflineQueueStats = (): OfflineQueueStats => ({
  pendingOperations: 0,
  isOnline: true,
  isSyncing: false,
  oldestOperation: null,
});

/**
 * Subscribe to online status changes (always returns true immediately)
 */
export const onOnlineStatusChange = (callback: (isOnline: boolean) => void): (() => void) => {
  // Immediately notify that we're online
  callback(true);
  // Return unsubscribe function (no-op)
  return () => {};
};

/**
 * Sync pending operations - no-op since there are none
 */
export const syncOfflineQueue = async (): Promise<{ success: number; failed: number }> => {
  return { success: 0, failed: 0 };
};

/**
 * Legacy export for backward compatibility
 * @deprecated Use individual exports instead
 */
export const offlineQueue = {
  getStats: getOfflineQueueStats,
  onOnlineStatusChange,
  sync: syncOfflineQueue,
  online: true as const,
};
