/** Tests rateLimiter — BUG-024 */
import { describe, expect, it } from 'vitest';
import { AppwriteRateLimiter } from '../appwrite/rateLimiter';

describe('AppwriteRateLimiter BUG-024', () => {
  it('resuelve peticiones encoladas durante procesamiento', async () => {
    const limiter = new AppwriteRateLimiter({ maxRequestsPerWindow: 100, windowMs: 60_000, maxRetries: 0, baseRetryDelay: 1, maxRetryDelay: 1 });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const first = limiter.enqueue(async () => { await gate; return 1; });
    await Promise.resolve(); await Promise.resolve();
    const second = limiter.enqueue(async () => 2);
    release?.();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
  });
});
