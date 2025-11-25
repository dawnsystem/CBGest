/**
 * @fileoverview Servicio de base de datos con rate limiting, caché y offline support
 * @description Wrapper sobre los servicios existentes de Appwrite con todas las protecciones integradas
 */

import { rateLimiter } from './rateLimiter';
import { cache, CACHE_TTLS } from './cache';
import { offlineQueue } from './offlineQueue';
import { databaseService, isAppwriteInitialized } from '../../services/appwriteService';
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
  /** Permitir operación offline */
  allowOffline?: boolean;
  /** Prioridad de la petición */
  priority?: 'high' | 'normal' | 'low';
}

// Debounce tracking para updates frecuentes
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_DELAY = 2000; // 2 segundos para progress updates

/**
 * Ejecuta una función con debounce por clave
 */
function debounced<T>(key: string, fn: () => Promise<T>, delay: number = DEBOUNCE_DELAY): Promise<T> {
  return new Promise((resolve, reject) => {
    const existingTimer = debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      debounceTimers.delete(key);
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, delay);

    debounceTimers.set(key, timer);
  });
}

class ProtectedDatabaseService {
  constructor() {
    this.setupOfflineSync();
  }

  /**
   * Configura la sincronización de operaciones offline
   */
  private setupOfflineSync(): void {
    offlineQueue.registerSyncCallback(async (operation) => {
      const { type, collection, documentId, data } = operation;

      switch (type) {
        case 'create':
          if (collection === 'invoices' && data) {
            await databaseService.createInvoice(data as unknown as Invoice);
          } else if (collection === 'entries' && data) {
            await databaseService.createEntry(data as unknown as AccountingEntry);
          } else if (collection === 'transactions' && data) {
            await databaseService.createTransaction(data as unknown as BankTransaction);
          } else if (collection === 'suppliers' && data) {
            await databaseService.createSupplier(data as unknown as Supplier);
          } else if (collection === 'uploads' && data) {
            await databaseService.createUploadItem(data as unknown as QueueItem);
          } else if (collection === 'notifications' && data) {
            await databaseService.createNotification(data as unknown as Notification);
          }
          break;

        case 'update':
          if (!documentId) throw new Error('documentId requerido para update');
          if (collection === 'invoices' && data) {
            await databaseService.updateInvoice(data as unknown as Invoice);
          } else if (collection === 'entries' && data) {
            await databaseService.updateEntry(data as unknown as AccountingEntry);
          } else if (collection === 'transactions' && data) {
            await databaseService.updateTransaction(data as unknown as BankTransaction);
          } else if (collection === 'suppliers' && data) {
            await databaseService.updateSupplier(data as unknown as Supplier);
          } else if (collection === 'uploads' && data) {
            await databaseService.updateUploadItem(data as unknown as QueueItem);
          } else if (collection === 'notifications' && data) {
            await databaseService.updateNotification(data as unknown as Notification);
          }
          break;

        case 'delete':
          if (!documentId) throw new Error('documentId requerido para delete');
          if (collection === 'invoices') {
            await databaseService.deleteInvoice(documentId);
          } else if (collection === 'entries') {
            await databaseService.deleteEntry(documentId);
          } else if (collection === 'suppliers') {
            await databaseService.deleteSupplier(documentId);
          } else if (collection === 'uploads') {
            await databaseService.deleteUploadItem(documentId);
          } else if (collection === 'notifications') {
            await databaseService.deleteNotification(documentId);
          }
          // Note: transactions don't have a delete method in databaseService
          break;
      }
    });
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
        console.log('[ProtectedDB] Cache hit para invoices');
        return cached;
      }
    }

    // Si estamos offline, devolver caché stale
    if (!offlineQueue.online) {
      const stale = cache.getStale<Invoice[]>(cacheKey);
      if (stale) {
        console.log('[ProtectedDB] Offline - usando caché stale para invoices');
        return stale;
      }
      throw new Error('Sin conexión y sin datos en caché');
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
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'invoices', invoice.id, invoice as unknown as Record<string, unknown>);
      cache.invalidateCollection('invoices');
      return invoice;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createInvoice(invoice);
    }, priority);

    cache.invalidateCollection('invoices');
    return result;
  }

  async updateInvoice(invoice: Invoice, options: MutationOptions = {}): Promise<Invoice> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'invoices', invoice.id, invoice as unknown as Record<string, unknown>);
      cache.invalidateCollection('invoices');
      return invoice;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateInvoice(invoice);
    }, priority);

    cache.invalidateCollection('invoices');
    return result;
  }

  async deleteInvoice(id: string, options: MutationOptions = {}): Promise<void> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('delete', 'invoices', id);
      cache.invalidateCollection('invoices');
      return;
    }

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteInvoice(id);
    }, priority);

    cache.invalidateCollection('invoices');
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
        console.log('[ProtectedDB] Cache hit para entries');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<AccountingEntry[]>(cacheKey);
      if (stale) return stale;
      throw new Error('Sin conexión y sin datos en caché');
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getEntries();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.ENTRIES);
    return result;
  }

  async createEntry(entry: AccountingEntry, options: MutationOptions = {}): Promise<AccountingEntry> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'entries', entry.id, entry as unknown as Record<string, unknown>);
      cache.invalidateCollection('entries');
      return entry;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createEntry(entry);
    }, priority);

    cache.invalidateCollection('entries');
    return result;
  }

  async updateEntry(entry: AccountingEntry, options: MutationOptions = {}): Promise<AccountingEntry> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'entries', entry.id, entry as unknown as Record<string, unknown>);
      cache.invalidateCollection('entries');
      return entry;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateEntry(entry);
    }, priority);

    cache.invalidateCollection('entries');
    return result;
  }

  async deleteEntry(id: string, options: MutationOptions = {}): Promise<void> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('delete', 'entries', id);
      cache.invalidateCollection('entries');
      return;
    }

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
        console.log('[ProtectedDB] Cache hit para transactions');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<BankTransaction[]>(cacheKey);
      if (stale) return stale;
      throw new Error('Sin conexión y sin datos en caché');
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getTransactions();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.TRANSACTIONS);
    return result;
  }

  async createTransaction(tx: BankTransaction, options: MutationOptions = {}): Promise<BankTransaction> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'transactions', tx.id, tx as unknown as Record<string, unknown>);
      cache.invalidateCollection('transactions');
      return tx;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createTransaction(tx);
    }, priority);

    cache.invalidateCollection('transactions');
    return result;
  }

  async updateTransaction(tx: BankTransaction, options: MutationOptions = {}): Promise<BankTransaction> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'transactions', tx.id, tx as unknown as Record<string, unknown>);
      cache.invalidateCollection('transactions');
      return tx;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateTransaction(tx);
    }, priority);

    cache.invalidateCollection('transactions');
    return result;
  }

  // Note: Transaction deletion is not supported by databaseService
  // Transactions are typically managed as part of bank reconciliation and should not be deleted directly
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
        console.log('[ProtectedDB] Cache hit para suppliers');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<Supplier[]>(cacheKey);
      if (stale) return stale;
      throw new Error('Sin conexión y sin datos en caché');
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getSuppliers();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.SUPPLIERS);
    return result;
  }

  async createSupplier(supplier: Supplier, options: MutationOptions = {}): Promise<Supplier> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'suppliers', supplier.id, supplier as unknown as Record<string, unknown>);
      cache.invalidateCollection('suppliers');
      return supplier;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createSupplier(supplier);
    }, priority);

    cache.invalidateCollection('suppliers');
    return result;
  }

  async updateSupplier(supplier: Supplier, options: MutationOptions = {}): Promise<Supplier> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'suppliers', supplier.id, supplier as unknown as Record<string, unknown>);
      cache.invalidateCollection('suppliers');
      return supplier;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateSupplier(supplier);
    }, priority);

    cache.invalidateCollection('suppliers');
    return result;
  }

  async deleteSupplier(id: string, options: MutationOptions = {}): Promise<void> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('delete', 'suppliers', id);
      cache.invalidateCollection('suppliers');
      return;
    }

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
        console.log('[ProtectedDB] Cache hit para settings');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<AppSettings>(cacheKey);
      if (stale) return stale;
      return null;
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
        console.log('[ProtectedDB] Cache hit para upload queue');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<QueueItem[]>(cacheKey);
      if (stale) return stale;
      return [];
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getUploadQueue();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.UPLOAD_QUEUE);
    return result;
  }

  async createUploadItem(item: QueueItem, options: MutationOptions = {}): Promise<QueueItem> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'uploads', item.id, item as unknown as Record<string, unknown>);
      cache.invalidateCollection('uploads');
      return item;
    }

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
    const { allowOffline = true, priority = 'low' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'uploads', item.id, item as unknown as Record<string, unknown>);
      return item;
    }

    // DEBOUNCE: Agrupa actualizaciones por item.id
    // Esto es crítico para evitar rate limiting durante análisis de facturas
    return debounced(`upload_${item.id}`, async () => {
      const result = await rateLimiter.enqueue(async () => {
        return await databaseService.updateUploadItem(item);
      }, priority);
      return result;
    });
  }

  async deleteUploadItem(id: string, options: MutationOptions = {}): Promise<void> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('delete', 'uploads', id);
      cache.invalidateCollection('uploads');
      return;
    }

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteUploadItem(id);
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
        console.log('[ProtectedDB] Cache hit para notifications');
        return cached;
      }
    }

    if (!offlineQueue.online) {
      const stale = cache.getStale<Notification[]>(cacheKey);
      if (stale) return stale;
      return [];
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.getNotifications();
    }, priority);

    cache.set(cacheKey, result, undefined, undefined, CACHE_TTLS.NOTIFICATIONS);
    return result;
  }

  async createNotification(notification: Notification, options: MutationOptions = {}): Promise<Notification> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('create', 'notifications', notification.id, notification as unknown as Record<string, unknown>);
      cache.invalidateCollection('notifications');
      return notification;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.createNotification(notification);
    }, priority);

    cache.invalidateCollection('notifications');
    return result;
  }

  async updateNotification(notification: Notification, options: MutationOptions = {}): Promise<Notification> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('update', 'notifications', notification.id, notification as unknown as Record<string, unknown>);
      return notification;
    }

    const result = await rateLimiter.enqueue(async () => {
      return await databaseService.updateNotification(notification);
    }, priority);

    return result;
  }

  async deleteNotification(id: string, options: MutationOptions = {}): Promise<void> {
    const { allowOffline = true, priority = 'normal' } = options;

    if (!offlineQueue.online && allowOffline) {
      offlineQueue.add('delete', 'notifications', id);
      cache.invalidateCollection('notifications');
      return;
    }

    await rateLimiter.enqueue(async () => {
      await databaseService.deleteNotification(id);
    }, priority);

    cache.invalidateCollection('notifications');
  }

  async markAllNotificationsRead(): Promise<void> {
    // Fetch all notifications and update unread ones
    const notifications = await this.getNotifications();
    const unreadNotifs = notifications.filter(n => !n.read);

    // Update each unread notification with rate limiting
    for (const notif of unreadNotifs) {
      await rateLimiter.enqueue(async () => {
        await databaseService.updateNotification({ ...notif, read: true });
      }, 'low');
    }

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
   * Fuerza sincronización de operaciones pendientes
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
   * Verifica si está online
   */
  get isOnline(): boolean {
    return offlineQueue.online;
  }

  /**
   * Suscribe a cambios de estado de conexión
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
