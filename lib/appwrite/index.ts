/**
 * @fileoverview Punto de entrada para el sistema de protección de Appwrite
 * @description Exporta todos los módulos de rate limiting, caché y offline queue
 */

export { rateLimiter } from './rateLimiter';
export type { RateLimiterConfig } from './rateLimiter';

export { cache, CACHE_TTLS } from './cache';
export type { CacheConfig } from './cache';

export { offlineQueue, getOfflineQueueStats, onOnlineStatusChange, syncOfflineQueue } from './offlineQueue';
export type { OfflineQueueStats } from './offlineQueue';

export { protectedDatabase } from './protectedDatabase';
export type { QueryOptions, MutationOptions } from './protectedDatabase';
