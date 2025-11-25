/**
 * @fileoverview Sistema de caché en memoria para Appwrite
 * @description Reduce llamadas redundantes a la API. Solo memoria, sin persistencia en localStorage.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheConfig {
  /** TTL por defecto en milisegundos */
  defaultTTL: number;
  /** Máximo de entradas en caché */
  maxEntries: number;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutos
  maxEntries: 500,
};

// TTLs específicos por tipo de datos
export const CACHE_TTLS = {
  INVOICES: 2 * 60 * 1000,      // 2 minutos - datos frecuentemente modificados
  ENTRIES: 5 * 60 * 1000,       // 5 minutos
  TRANSACTIONS: 5 * 60 * 1000,  // 5 minutos
  SUPPLIERS: 10 * 60 * 1000,    // 10 minutos - datos más estables
  SETTINGS: 30 * 60 * 1000,     // 30 minutos - raramente cambian
  USER: 15 * 60 * 1000,         // 15 minutos
  UPLOAD_QUEUE: 1 * 60 * 1000,  // 1 minuto - sincronización frecuente
  NOTIFICATIONS: 2 * 60 * 1000, // 2 minutos
};

class AppwriteCache {
  private memoryCache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Genera una clave de caché consistente
   */
  private generateKey(collection: string, documentId?: string, queries?: string[]): string {
    const parts = [collection];
    if (documentId) parts.push(documentId);
    if (queries?.length) parts.push(JSON.stringify(queries.sort()));
    return parts.join(':');
  }

  /**
   * Obtiene un valor del caché
   */
  get<T>(collection: string, documentId?: string, queries?: string[]): T | null {
    const key = this.generateKey(collection, documentId, queries);
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(collection, documentId, queries);
      return null;
    }

    return entry.data;
  }

  /**
   * Obtiene un valor aunque esté expirado (solo para compatibilidad, no recomendado)
   */
  getStale<T>(collection: string, documentId?: string, queries?: string[]): T | null {
    const key = this.generateKey(collection, documentId, queries);
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    return entry?.data ?? null;
  }

  /**
   * Guarda un valor en caché (solo memoria)
   */
  set<T>(
    collection: string,
    data: T,
    documentId?: string,
    queries?: string[],
    ttl?: number
  ): void {
    const key = this.generateKey(collection, documentId, queries);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl ?? this.config.defaultTTL),
    };

    // Verificar límite de entradas
    if (this.memoryCache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.memoryCache.set(key, entry as CacheEntry<unknown>);
  }

  /**
   * Elimina una entrada del caché
   */
  delete(collection: string, documentId?: string, queries?: string[]): void {
    const key = this.generateKey(collection, documentId, queries);
    this.memoryCache.delete(key);
  }

  /**
   * Invalida todo el caché de una colección
   */
  invalidateCollection(collection: string): void {
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((_, key) => {
      if (key.startsWith(collection + ':') || key === collection) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.memoryCache.delete(key));
    console.log(`[Cache] Invalidada colección ${collection}: ${keysToDelete.length} entradas eliminadas`);
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.memoryCache.clear();
  }

  /**
   * Elimina la entrada más antigua para hacer espacio
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    this.memoryCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }

  /**
   * Verifica si una colección tiene datos en caché (válidos)
   */
  hasData(collection: string): boolean {
    let found = false;
    const now = Date.now();
    this.memoryCache.forEach((entry, key) => {
      if ((key.startsWith(collection + ':') || key === collection) && entry.expiresAt > now) {
        found = true;
      }
    });
    return found;
  }

  /**
   * Estadísticas del caché
   */
  getStats() {
    let validEntries = 0;
    let expiredEntries = 0;
    const now = Date.now();

    this.memoryCache.forEach(entry => {
      if (entry.expiresAt > now) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    });

    return {
      totalEntries: this.memoryCache.size,
      validEntries,
      expiredEntries,
      maxEntries: this.config.maxEntries,
    };
  }
}

export const cache = new AppwriteCache();
export type { CacheConfig };
