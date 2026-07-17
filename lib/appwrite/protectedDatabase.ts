/**
 * @fileoverview Servicio de base de datos con rate limiting y caché
 * @description Wrapper sobre los servicios de Appwrite. Requiere conexión - no hay modo offline.
 */

import { rateLimiter } from './rateLimiter';
import { cache, CACHE_TTLS } from './cache';
import { offlineQueue } from './offlineQueue';
import { databaseService } from '../../services/appwriteService';
import { APPWRITE_CONFIG } from '../../config/appwrite';
import type {
  Invoice,
  AccountingEntry,
  BankTransaction,
  Supplier,
  AppSettings,
  QueueItem,
  Notification
} from '../../types';

// Tipos de colecciones disponibles
type CollectionName = keyof typeof APPWRITE_CONFIG.collections;

interface QueryOptions {
  /** Forzar recarga desde servidor, ignorando caché */
  forceRefresh?: boolean;
  /** Prioridad de la petición */
  priority?: 'high' | 'normal' | 'low';
}

interface MutationOptions {
  /** Prioridad de la petición */
  priority?: 'high' | 'normal' | 'low';
}

// Debounce tracking para updates frecuentes
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPromises = new Map<string, { resolve: (value: unknown) => void; reject: (error: unknown) => void }[]>();
const DEBOUNCE_DELAY = 2000; // 2 segundos para progress updates

/**
 * Ejecuta una función con debounce por clave
 * Agrupa múltiples llamadas en una sola ejecución
 */
function debounced<T>(key: string, fn: () => Promise<T>, delay: number = DEBOUNCE_DELAY): Promise<T> {
  return new Promise((resolve, reject) => {
    // Añadir a la lista de promesas pendientes
    if (!pendingPromises.has(key)) {
      pendingPromises.set(key, []);
    }
    pendingPromises.get(key)!.push({ resolve: resolve as (value: unknown) => void, reject });

    // Cancelar timer existente
    const existingTimer = debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Crear nuevo timer
    const timer = setTimeout(async () => {
      debounceTimers.delete(key);
      const callbacks = pendingPromises.get(key) || [];
      pendingPromises.delete(key);

      try {
        const result = await fn();
        // Resolver todas las promesas pendientes con el mismo resultado
        callbacks.forEach(cb => cb.resolve(result));
      } catch (error) {
        // Rechazar todas las promesas pendientes
        callbacks.forEach(cb => cb.reject(error));
      }
    }, delay);

    debounceTimers.set(key, timer);
  });
}

class ProtectedDatabaseService {
  constructor() {
    // No hay sincronización offline - la app requiere conexión
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  async getInvoices(options: QueryOptions = {}): Promise<Invoice[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'invoices';

    // Intentar caché primero
    if (!forceRefresh) {
      const cached = cache.get<Invoice[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para invoices');
        return cached;
      }
    }

    // Hacer petición con rate limiter
    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getInvoices();
    }, priority);

    // Guardar en caché
    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.INVOICES);

    return result;
  }

  async createInvoice(invoice: Invoice, options: MutationOptions = {}): Promise<Invoice> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createInvoice(invoice);
    }, priority);

    cache.invalidateCollection('invoices');
    return result;
  }

  async updateInvoice(invoice: Invoice, options: MutationOptions = {}): Promise<Invoice> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateInvoice(invoice);
    }, priority);

    cache.invalidateCollection('invoices');
    return result;
  }

  async deleteInvoice(id: string, options: MutationOptions = {}): Promise<void> {
    const { priority = 'normal' } = options;

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteInvoice(id);
    }, priority);

    cache.invalidateCollection('invoices');
  }

  async findInvoiceByFileHash(fileHash: string, fiscalYearId?: string): Promise<Invoice | null> {
    return rateLimiter.enqueue(async () => {
      return await databaseService.findInvoiceByFileHash(fileHash, fiscalYearId);
    }, 'high');
  }

  async findInvoiceByContentFingerprint(
    contentFingerprint: string,
    fiscalYearId?: string
  ): Promise<Invoice | null> {
    return rateLimiter.enqueue(async () => {
      return await databaseService.findInvoiceByContentFingerprint(contentFingerprint, fiscalYearId);
    }, 'high');
  }

  // ============================================================================
  // ACCOUNTING ENTRIES
  // ============================================================================

  async getEntries(options: QueryOptions = {}): Promise<AccountingEntry[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'entries';

    if (!forceRefresh) {
      const cached = cache.get<AccountingEntry[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para entries');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getEntries();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.ENTRIES);
    return result;
  }

  async createEntry(entry: AccountingEntry, options: MutationOptions = {}): Promise<AccountingEntry> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createEntry(entry);
    }, priority);

    cache.invalidateCollection('entries');
    return result;
  }

  async updateEntry(entry: AccountingEntry, options: MutationOptions = {}): Promise<AccountingEntry> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateEntry(entry);
    }, priority);

    cache.invalidateCollection('entries');
    return result;
  }

  async deleteEntry(id: string, options: MutationOptions = {}): Promise<void> {
    const { priority = 'normal' } = options;

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteEntry(id);
    }, priority);

    cache.invalidateCollection('entries');
  }

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  async getTransactions(options: QueryOptions = {}): Promise<BankTransaction[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'transactions';

    if (!forceRefresh) {
      const cached = cache.get<BankTransaction[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para transactions');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getTransactions();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.TRANSACTIONS);
    return result;
  }

  async createTransaction(tx: BankTransaction, options: MutationOptions = {}): Promise<BankTransaction> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createTransaction(tx);
    }, priority);

    cache.invalidateCollection('transactions');
    return result;
  }

  async updateTransaction(tx: BankTransaction, options: MutationOptions = {}): Promise<BankTransaction> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateTransaction(tx);
    }, priority);

    cache.invalidateCollection('transactions');
    return result;
  }

  async deleteTransaction(_id: string, _options: MutationOptions = {}): Promise<void> {
    console.warn('[ProtectedDB] deleteTransaction not supported - transactions cannot be deleted');
    throw new Error('Eliminar transacciones no está soportado');
  }

  // ============================================================================
  // SUPPLIERS
  // ============================================================================

  async getSuppliers(options: QueryOptions = {}): Promise<Supplier[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'suppliers';

    if (!forceRefresh) {
      const cached = cache.get<Supplier[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para suppliers');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getSuppliers();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.SUPPLIERS);
    return result;
  }

  async createSupplier(supplier: Supplier, options: MutationOptions = {}): Promise<Supplier> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createSupplier(supplier);
    }, priority);

    cache.invalidateCollection('suppliers');
    return result;
  }

  async updateSupplier(supplier: Supplier, options: MutationOptions = {}): Promise<Supplier> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateSupplier(supplier);
    }, priority);

    cache.invalidateCollection('suppliers');
    return result;
  }

  async deleteSupplier(id: string, options: MutationOptions = {}): Promise<void> {
    const { priority = 'normal' } = options;

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteSupplier(id);
    }, priority);

    cache.invalidateCollection('suppliers');
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  async getSettings(options: QueryOptions = {}): Promise<AppSettings | null> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'settings';

    if (!forceRefresh) {
      const cached = cache.get<AppSettings>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para settings');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getSettings();
    }, priority);

    if (result) {
      cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.SETTINGS);
    }
    return result;
  }

  async saveSettings(settings: AppSettings, options: MutationOptions = {}): Promise<AppSettings> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.saveSettings(settings);
    }, priority);

    cache.invalidateCollection('settings');
    return result;
  }

  // ============================================================================
  // UPLOAD QUEUE - CON DEBOUNCE ESPECIAL PARA PROGRESS
  // ============================================================================

  async getUploadQueue(options: QueryOptions = {}): Promise<QueueItem[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'uploads';

    if (!forceRefresh) {
      const cached = cache.get<QueueItem[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para upload queue');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getUploadQueue();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.UPLOAD_QUEUE);
    return result;
  }

  async createUploadItem(item: QueueItem, options: MutationOptions = {}): Promise<QueueItem> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createUploadItem(item);
    }, priority);

    cache.invalidateCollection('uploads');
    return result;
  }

  /**
   * Actualiza un item de upload con DEBOUNCE para evitar rate limiting
   * Los updates de progreso se agrupan cada 2 segundos
   */
  async updateUploadItem(item: QueueItem, options: MutationOptions = {}): Promise<QueueItem> {
    const { priority = 'low' } = options;

    // DEBOUNCE: Agrupa actualizaciones por item.id
    // Esto es crítico para evitar rate limiting durante análisis de facturas
    return debounced(`upload_${item.id}`, async () => {
      const result = await rateLimiter.enqueue(async () => {
        return await databaseService.updateUploadItem(item);
      }, priority);
      cache.invalidateCollection('uploads');
      return result;
    });
  }

  async deleteUploadItem(id: string, storageFileId?: string, options: MutationOptions = {}): Promise<void> {
    const { priority = 'normal' } = options;

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteUploadItem(id, storageFileId);
    }, priority);

    cache.invalidateCollection('uploads');
  }

  async deleteCompletedUploads(): Promise<void> {
    await rateLimiter.enqueue(async () => {
      await databaseService.deleteCompletedUploads();
    }, 'low');

    cache.invalidateCollection('uploads');
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  async getNotifications(options: QueryOptions = {}): Promise<Notification[]> {
    const { forceRefresh = false, priority = 'normal' } = options;
    const cacheKey = 'notifications';

    if (!forceRefresh) {
      const cached = cache.get<Notification[]>(cacheKey);
      if (cached) {
        console.warn('[ProtectedDB] Cache hit para notifications');
        return cached;
      }
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getNotifications();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.NOTIFICATIONS);
    return result;
  }

  async createNotification(notification: Notification, options: MutationOptions = {}): Promise<Notification> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createNotification(notification);
    }, priority);

    cache.invalidateCollection('notifications');
    return result;
  }

  async updateNotification(notification: Notification, options: MutationOptions = {}): Promise<Notification> {
    const { priority = 'normal' } = options;

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateNotification(notification);
    }, priority);

    cache.invalidateCollection('notifications');
    return result;
  }

  async deleteNotification(id: string, options: MutationOptions = {}): Promise<void> {
    const { priority = 'normal' } = options;

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteNotification(id);
    }, priority);

    cache.invalidateCollection('notifications');
  }

  async markAllNotificationsRead(): Promise<void> {
    const notifications = await this.getNotifications();
    const unreadNotifs = notifications.filter(n => !n.read);

    // PERF-002: Run all updates in parallel instead of sequential await-in-loop.
    await Promise.all(
      unreadNotifs.map(notif =>
        rateLimiter.enqueue(async () => {
          await databaseService.updateNotification({ ...notif, read: true });
        }, 'low')
      )
    );

    cache.invalidateCollection('notifications');
  }

  async deleteAllNotifications(): Promise<void> {
    await rateLimiter.enqueue(async () => {
      await databaseService.deleteAllNotifications();
    }, 'low');

    cache.invalidateCollection('notifications');
  }

  // ============================================================================
  // UTILIDADES
  // ============================================================================

  /**
   * Fuerza sincronización de operaciones pendientes (no-op - no hay modo offline)
   */
  async forceSync(): Promise<{ success: number; failed: number }> {
    return offlineQueue.sync();
  }

  /**
   * Invalida el caché de una colección específica
   */
  invalidateCache(collection: CollectionName): void {
    cache.invalidateCollection(collection);
  }

  /**
   * Limpia todo el caché
   */
  clearAllCache(): void {
    cache.clear();
  }

  /**
   * Verifica si está online (siempre true - la app requiere conexión)
   */
  get isOnline(): boolean {
    return true;
  }

  /**
   * Suscribe a cambios de estado de conexión (siempre notifica online)
   */
  onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
    return offlineQueue.onOnlineStatusChange(callback);
  }

  /**
   * Obtiene estadísticas del sistema
   */
  getSystemStats() {
    return {
      rateLimiter: rateLimiter.getStats(),
      cache: cache.getStats(),
      offlineQueue: offlineQueue.getStats(),
    };
  }
}

export const protectedDatabase = new ProtectedDatabaseService();
export type { QueryOptions, MutationOptions };
