/**
 * @fileoverview Sistema de control de rate limiting para Appwrite
 * @description Implementa cola de peticiones, retry con backoff exponencial
 *              y throttling inteligente para evitar exceder límites de API
 */

interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

interface RateLimiterConfig {
  /** Máximo de peticiones por ventana de tiempo */
  maxRequestsPerWindow: number;
  /** Ventana de tiempo en milisegundos */
  windowMs: number;
  /** Máximo de reintentos por petición */
  maxRetries: number;
  /** Delay base para backoff exponencial (ms) */
  baseRetryDelay: number;
  /** Máximo delay entre reintentos (ms) */
  maxRetryDelay: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerWindow: 50, // Appwrite tiene ~120/min, dejamos margen
  windowMs: 60000, // 1 minuto
  maxRetries: 3,
  baseRetryDelay: 1000,
  maxRetryDelay: 30000,
};

class AppwriteRateLimiter {
  private queue: QueuedRequest<unknown>[] = [];
  private requestTimestamps: number[] = [];
  private isProcessing = false;
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Encola una petición para ser ejecutada respetando rate limits
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: crypto.randomUUID(),
        execute,
        resolve: resolve as (value: T) => void,
        reject,
        retries: 0,
        priority,
        timestamp: Date.now(),
      };

      // Insertar según prioridad
      if (priority === 'high') {
        const firstNormalIndex = this.queue.findIndex(r => r.priority !== 'high');
        if (firstNormalIndex === -1) {
          this.queue.push(request as QueuedRequest<unknown>);
        } else {
          this.queue.splice(firstNormalIndex, 0, request as QueuedRequest<unknown>);
        }
      } else if (priority === 'low') {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        const firstLowIndex = this.queue.findIndex(r => r.priority === 'low');
        if (firstLowIndex === -1) {
          this.queue.push(request as QueuedRequest<unknown>);
        } else {
          this.queue.splice(firstLowIndex, 0, request as QueuedRequest<unknown>);
        }
      }

      this.processQueue();
    });
  }

  /**
   * Procesa la cola de peticiones
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Limpiar timestamps antiguos
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        ts => now - ts < this.config.windowMs
      );

      // Verificar si podemos hacer más peticiones
      if (this.requestTimestamps.length >= this.config.maxRequestsPerWindow) {
        const oldestTimestamp = this.requestTimestamps[0];
        const waitTime = this.config.windowMs - (now - oldestTimestamp) + 100;
        console.log(`[RateLimiter] Límite alcanzado. Esperando ${waitTime}ms...`);
        await this.sleep(waitTime);
        continue;
      }

      const request = this.queue.shift();
      if (!request) continue;

      try {
        this.requestTimestamps.push(Date.now());
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        if (this.isRateLimitError(error) && request.retries < this.config.maxRetries) {
          // Reencolar con backoff exponencial
          request.retries++;
          const delay = Math.min(
            this.config.baseRetryDelay * Math.pow(2, request.retries),
            this.config.maxRetryDelay
          );
          console.log(`[RateLimiter] Rate limit hit. Reintento ${request.retries}/${this.config.maxRetries} en ${delay}ms`);

          await this.sleep(delay);
          this.queue.unshift(request); // Reinsertar al principio
        } else {
          request.reject(error as Error);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Detecta si el error es de rate limiting
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.toLowerCase().includes('rate limit') ||
             error.message.includes('429') ||
             error.message.includes('too many requests');
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas del rate limiter
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      requestsInWindow: this.requestTimestamps.length,
      maxRequestsPerWindow: this.config.maxRequestsPerWindow,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Limpia la cola (para logout o errores críticos)
   */
  clearQueue(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

export const rateLimiter = new AppwriteRateLimiter();
export type { RateLimiterConfig };
