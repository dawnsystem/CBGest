/**
 * @fileoverview Stub de offline queue - funcionalidad offline eliminada
 * @description La app ahora es completamente online. Sin conexión a Appwrite, no funciona.
 */

type OperationType = 'create' | 'update' | 'delete';

interface PendingOperation {
  id: string;
  type: OperationType;
  collection: string;
  documentId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
  retries: number;
  lastError?: string;
}

type SyncCallback = (operation: PendingOperation) => Promise<void>;
type OnlineStatusCallback = (isOnline: boolean) => void;

/**
 * OfflineQueue stub - la funcionalidad offline ha sido eliminada.
 * La app requiere conexión a Appwrite para funcionar.
 */
class OfflineQueue {
  private onlineStatusCallbacks: OnlineStatusCallback[] = [];

  constructor() {
    // No setup needed - always online mode
  }

  /**
   * Suscribe a cambios de estado de conexión (siempre online)
   */
  onOnlineStatusChange(callback: OnlineStatusCallback): () => void {
    this.onlineStatusCallbacks.push(callback);
    // Immediately notify that we're online
    callback(true);
    return () => {
      this.onlineStatusCallbacks = this.onlineStatusCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Registra el callback para sincronizar operaciones (no-op)
   */
  registerSyncCallback(_callback: SyncCallback): void {
    // No-op: no hay operaciones offline que sincronizar
  }

  /**
   * Detiene la sincronización automática (no-op)
   */
  stopAutoSync(): void {
    // No-op
  }

  /**
   * Añade una operación a la cola - DESHABILITADO
   * @throws Error siempre - no se permite modo offline
   */
  add(
    _type: OperationType,
    _collection: string,
    _documentId?: string,
    _data?: Record<string, unknown>
  ): string {
    throw new Error('Modo offline deshabilitado. Se requiere conexión a Appwrite.');
  }

  /**
   * Sincroniza las operaciones pendientes (no hay ninguna)
   */
  async sync(): Promise<{ success: number; failed: number }> {
    return { success: 0, failed: 0 };
  }

  /**
   * Verifica si hay operaciones pendientes (nunca hay)
   */
  hasPendingOperations(_collection: string, _documentId?: string): boolean {
    return false;
  }

  /**
   * Obtiene operaciones pendientes (lista vacía)
   */
  getPendingOperations(): PendingOperation[] {
    return [];
  }

  /**
   * Limpia la cola (no-op)
   */
  clear(): void {
    // No-op
  }

  /**
   * Estado de la conexión - siempre online
   * La app requiere conexión para funcionar
   */
  get online(): boolean {
    return true;
  }

  /**
   * Estadísticas de la cola
   */
  getStats() {
    return {
      pendingOperations: 0,
      isOnline: true,
      isSyncing: false,
      oldestOperation: null,
    };
  }
}

export const offlineQueue = new OfflineQueue();
export type { PendingOperation, OperationType };
