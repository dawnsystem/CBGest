/**
 * @fileoverview Cola de operaciones pendientes para sincronización offline
 * @description Persiste operaciones fallidas y las reintenta cuando hay conexión
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

interface OfflineQueueConfig {
  storageKey: string;
  maxRetries: number;
  syncInterval: number;
}

const DEFAULT_OFFLINE_CONFIG: OfflineQueueConfig = {
  storageKey: 'cbgest_offline_queue',
  maxRetries: 5,
  syncInterval: 30000, // 30 segundos
};

type SyncCallback = (operation: PendingOperation) => Promise<void>;
type OnlineStatusCallback = (isOnline: boolean) => void;

class OfflineQueue {
  private queue: PendingOperation[] = [];
  private config: OfflineQueueConfig;
  private syncCallback: SyncCallback | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing = false;
  private onlineStatusCallbacks: OnlineStatusCallback[] = [];

  constructor(config: Partial<OfflineQueueConfig> = {}) {
    this.config = { ...DEFAULT_OFFLINE_CONFIG, ...config };
    this.loadFromStorage();
    this.setupNetworkListeners();
  }

  /**
   * Configura los listeners de conectividad
   */
  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[OfflineQueue] Conexión restaurada. Iniciando sincronización...');
      this._isOnline = true;
      this.notifyOnlineStatus(true);
      this.sync();
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineQueue] Conexión perdida. Las operaciones se encolarán.');
      this._isOnline = false;
      this.notifyOnlineStatus(false);
    });
  }

  /**
   * Suscribe a cambios de estado de conexión
   */
  onOnlineStatusChange(callback: OnlineStatusCallback): () => void {
    this.onlineStatusCallbacks.push(callback);
    return () => {
      this.onlineStatusCallbacks = this.onlineStatusCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyOnlineStatus(isOnline: boolean): void {
    this.onlineStatusCallbacks.forEach(cb => cb(isOnline));
  }

  /**
   * Registra el callback para sincronizar operaciones
   */
  registerSyncCallback(callback: SyncCallback): void {
    this.syncCallback = callback;
    this.startAutoSync();
  }

  /**
   * Inicia la sincronización automática periódica
   */
  private startAutoSync(): void {
    if (this.syncIntervalId) return;

    this.syncIntervalId = setInterval(() => {
      if (this._isOnline && this.queue.length > 0) {
        this.sync();
      }
    }, this.config.syncInterval);
  }

  /**
   * Detiene la sincronización automática
   */
  stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Añade una operación a la cola
   */
  add(
    type: OperationType,
    collection: string,
    documentId?: string,
    data?: Record<string, unknown>
  ): string {
    const operation: PendingOperation = {
      id: crypto.randomUUID(),
      type,
      collection,
      documentId,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    this.queue.push(operation);
    this.saveToStorage();

    console.log(`[OfflineQueue] Operación encolada: ${type} en ${collection}`);

    // Intentar sincronizar inmediatamente si hay conexión
    if (this._isOnline) {
      this.sync();
    }

    return operation.id;
  }

  /**
   * Sincroniza las operaciones pendientes
   */
  async sync(): Promise<{ success: number; failed: number }> {
    if (!this.syncCallback || this.isSyncing || this.queue.length === 0) {
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    console.log(`[OfflineQueue] Sincronizando ${this.queue.length} operaciones...`);

    // Procesar en orden FIFO
    const operationsToProcess = [...this.queue];

    for (const operation of operationsToProcess) {
      try {
        await this.syncCallback(operation);
        this.removeOperation(operation.id);
        success++;
        console.log(`[OfflineQueue] ✓ Operación ${operation.id} sincronizada`);
      } catch (error) {
        operation.retries++;
        operation.lastError = error instanceof Error ? error.message : 'Error desconocido';

        if (operation.retries >= this.config.maxRetries) {
          console.error(`[OfflineQueue] ✗ Operación ${operation.id} fallida tras ${operation.retries} intentos. Eliminando.`);
          this.removeOperation(operation.id);
          failed++;
        } else {
          console.warn(`[OfflineQueue] Reintento ${operation.retries}/${this.config.maxRetries} para ${operation.id}`);
        }
      }
    }

    this.saveToStorage();
    this.isSyncing = false;

    console.log(`[OfflineQueue] Sincronización completada: ${success} éxitos, ${failed} fallos`);

    return { success, failed };
  }

  /**
   * Elimina una operación de la cola
   */
  private removeOperation(id: string): void {
    this.queue = this.queue.filter(op => op.id !== id);
  }

  /**
   * Verifica si hay operaciones pendientes para un documento
   */
  hasPendingOperations(collection: string, documentId?: string): boolean {
    return this.queue.some(op =>
      op.collection === collection &&
      (!documentId || op.documentId === documentId)
    );
  }

  /**
   * Obtiene operaciones pendientes
   */
  getPendingOperations(): PendingOperation[] {
    return [...this.queue];
  }

  /**
   * Guarda la cola en localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[OfflineQueue] Error guardando cola:', error);
    }
  }

  /**
   * Carga la cola desde localStorage
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`[OfflineQueue] Cargadas ${this.queue.length} operaciones pendientes`);
      }
    } catch (error) {
      console.error('[OfflineQueue] Error cargando cola:', error);
      this.queue = [];
    }
  }

  /**
   * Limpia la cola
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Estado de la conexión
   */
  get online(): boolean {
    return this._isOnline;
  }

  /**
   * Estadísticas de la cola
   */
  getStats() {
    return {
      pendingOperations: this.queue.length,
      isOnline: this._isOnline,
      isSyncing: this.isSyncing,
      oldestOperation: this.queue.length > 0
        ? new Date(this.queue[0].timestamp).toISOString()
        : null,
    };
  }
}

export const offlineQueue = new OfflineQueue();
export type { PendingOperation, OperationType };
