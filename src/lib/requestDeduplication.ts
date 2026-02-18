/**
 * Request Deduplication Utility
 *
 * Prevents duplicate concurrent API requests by caching in-flight promises.
 * When multiple identical requests are made simultaneously, only one actual
 * HTTP request is sent and the result is shared with all callers.
 */

interface CacheEntry<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface DeduplicationOptions {
  /** Time in milliseconds to keep the cached promise (default: 100ms) */
  ttlMs?: number;
  /** Maximum number of entries to cache (default: 100) */
  maxEntries?: number;
}

const DEFAULT_TTL_MS = 100;
const DEFAULT_MAX_ENTRIES = 100;

class RequestDeduplicator {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(options: DeduplicationOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Deduplicate a request by key.
   * If a request with the same key is already in-flight, returns the existing promise.
   * Otherwise, executes the request function and caches the result.
   */
  async dedupe<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    this.cleanup();

    const existing = this.cache.get(key);
    if (existing && Date.now() - existing.timestamp < this.ttlMs) {
      return existing.promise as Promise<T>;
    }

    const promise = requestFn()
      .then((result) => {
        // Keep the result cached for a bit longer to handle rapid identical requests
        return result;
      })
      .finally(() => {
        // Schedule cleanup after TTL
        setTimeout(() => {
          const entry = this.cache.get(key);
          if (entry && Date.now() - entry.timestamp >= this.ttlMs) {
            this.cache.delete(key);
          }
        }, this.ttlMs);
      });

    this.cache.set(key, {
      promise,
      timestamp: Date.now(),
    });

    // Enforce max entries by removing oldest entries
    if (this.cache.size > this.maxEntries) {
      const entriesToRemove = this.cache.size - this.maxEntries;
      const keys = [...this.cache.keys()];
      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(keys[i]);
      }
    }

    return promise;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if a key is currently cached
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && Date.now() - entry.timestamp < this.ttlMs;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

// Global deduplicator instance for API requests
export const apiDeduplicator = new RequestDeduplicator({
  ttlMs: 100, // Short TTL for rapid requests
  maxEntries: 100,
});

/**
 * Create a cache key from request parameters
 */
export function createRequestKey(
  method: string,
  path: string,
  params?: Record<string, unknown>
): string {
  const paramsStr = params ? JSON.stringify(params) : '';
  return `${method}:${path}:${paramsStr}`;
}

/**
 * Deduplicate a fetch request
 */
export async function deduplicatedFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  return apiDeduplicator.dedupe(key, fetchFn);
}

export { RequestDeduplicator };
