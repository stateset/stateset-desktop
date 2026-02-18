/**
 * IndexedDB Caching Layer
 *
 * Provides offline-first caching for agent data using IndexedDB.
 * Falls back gracefully when IndexedDB is unavailable.
 *
 * Features:
 * - Persistent storage across sessions
 * - TTL-based expiration
 * - Automatic cleanup of expired entries
 * - Type-safe API
 * - Offline detection
 */

import type { AgentSession, Brand, PlatformConnection } from '../types';
import { cacheLogger } from './logger';

// Database configuration
const DB_NAME = 'stateset-cache';
const DB_VERSION = 1;

// Store names
const STORES = {
  SESSIONS: 'sessions',
  BRANDS: 'brands',
  CONNECTIONS: 'connections',
  METADATA: 'metadata',
} as const;

// Default TTL values (in milliseconds)
const TTL = {
  SESSIONS: 5 * 60 * 1000, // 5 minutes
  BRANDS: 30 * 60 * 1000, // 30 minutes
  CONNECTIONS: 15 * 60 * 1000, // 15 minutes
};

// Cache entry wrapper
interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Database instance
let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) {
    cacheLogger.warn('IndexedDB not available, caching disabled');
    return null;
  }

  if (db) return db;

  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      cacheLogger.error('Failed to open IndexedDB', request.error);
      resolve(null);
    };

    request.onsuccess = () => {
      db = request.result;
      cacheLogger.info('IndexedDB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!database.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionsStore = database.createObjectStore(STORES.SESSIONS, { keyPath: 'key' });
        sessionsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.BRANDS)) {
        const brandsStore = database.createObjectStore(STORES.BRANDS, { keyPath: 'key' });
        brandsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.CONNECTIONS)) {
        const connectionsStore = database.createObjectStore(STORES.CONNECTIONS, { keyPath: 'key' });
        connectionsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.METADATA)) {
        database.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }

      cacheLogger.info('IndexedDB schema created');
    };
  });

  return dbInitPromise;
}

/**
 * Generic get operation from IndexedDB
 */
async function get<T>(storeName: string, key: string): Promise<T | null> {
  const database = await initDB();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
          cacheLogger.debug('Cache entry expired', { storeName, key });
          // Delete expired entry asynchronously
          del(storeName, key).catch(() => {});
          resolve(null);
          return;
        }

        cacheLogger.debug('Cache hit', { storeName, key });
        resolve(entry.data);
      };

      request.onerror = () => {
        cacheLogger.error('Cache get failed', request.error, { storeName, key });
        resolve(null);
      };
    } catch (error) {
      cacheLogger.error('Cache get exception', error, { storeName, key });
      resolve(null);
    }
  });
}

/**
 * Generic set operation to IndexedDB
 */
async function set<T>(storeName: string, key: string, data: T, ttlMs: number): Promise<void> {
  const database = await initDB();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };

      const request = store.put(entry);

      request.onsuccess = () => {
        cacheLogger.debug('Cache set', { storeName, key, ttlMs });
        resolve();
      };

      request.onerror = () => {
        cacheLogger.error('Cache set failed', request.error, { storeName, key });
        resolve();
      };
    } catch (error) {
      cacheLogger.error('Cache set exception', error, { storeName, key });
      resolve();
    }
  });
}

/**
 * Generic delete operation from IndexedDB
 */
async function del(storeName: string, key: string): Promise<void> {
  const database = await initDB();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        cacheLogger.debug('Cache delete', { storeName, key });
        resolve();
      };

      request.onerror = () => {
        cacheLogger.error('Cache delete failed', request.error, { storeName, key });
        resolve();
      };
    } catch (error) {
      cacheLogger.error('Cache delete exception', error, { storeName, key });
      resolve();
    }
  });
}

/**
 * Clear all entries from a store
 */
async function clearStore(storeName: string): Promise<void> {
  const database = await initDB();
  if (!database) return;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        cacheLogger.info('Cache store cleared', { storeName });
        resolve();
      };

      request.onerror = () => {
        cacheLogger.error('Cache clear failed', request.error, { storeName });
        resolve();
      };
    } catch (error) {
      cacheLogger.error('Cache clear exception', error, { storeName });
      resolve();
    }
  });
}

/**
 * Clean up expired entries from all stores
 */
async function cleanupExpiredEntries(): Promise<void> {
  const database = await initDB();
  if (!database) return;

  const now = Date.now();
  let totalDeleted = 0;

  for (const storeName of Object.values(STORES)) {
    if (storeName === STORES.METADATA) continue;

    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            totalDeleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => resolve();
      });
    } catch (error) {
      cacheLogger.error('Cleanup failed for store', error, { storeName });
    }
  }

  if (totalDeleted > 0) {
    cacheLogger.info('Cleanup completed', { totalDeleted });
  }
}

// ============================================
// Session Cache API
// ============================================

function getSessionsCacheKey(tenantId: string, brandId?: string): string {
  return brandId ? `sessions:${tenantId}:${brandId}` : `sessions:${tenantId}`;
}

export const sessionsCache = {
  async get(tenantId: string, brandId?: string): Promise<AgentSession[] | null> {
    const key = getSessionsCacheKey(tenantId, brandId);
    return get<AgentSession[]>(STORES.SESSIONS, key);
  },

  async set(
    tenantId: string,
    brandId: string | undefined,
    sessions: AgentSession[]
  ): Promise<void> {
    const key = getSessionsCacheKey(tenantId, brandId);
    await set(STORES.SESSIONS, key, sessions, TTL.SESSIONS);
  },

  async getSession(sessionId: string): Promise<AgentSession | null> {
    return get<AgentSession>(STORES.SESSIONS, `session:${sessionId}`);
  },

  async setSession(session: AgentSession): Promise<void> {
    await set(STORES.SESSIONS, `session:${session.id}`, session, TTL.SESSIONS);
  },

  async invalidate(tenantId: string, brandId?: string): Promise<void> {
    const key = getSessionsCacheKey(tenantId, brandId);
    await del(STORES.SESSIONS, key);
  },

  async clear(): Promise<void> {
    await clearStore(STORES.SESSIONS);
  },
};

// ============================================
// Brands Cache API
// ============================================

export const brandsCache = {
  async get(tenantId: string): Promise<Brand[] | null> {
    return get<Brand[]>(STORES.BRANDS, `brands:${tenantId}`);
  },

  async set(tenantId: string, brands: Brand[]): Promise<void> {
    await set(STORES.BRANDS, `brands:${tenantId}`, brands, TTL.BRANDS);
  },

  async invalidate(tenantId: string): Promise<void> {
    await del(STORES.BRANDS, `brands:${tenantId}`);
  },

  async clear(): Promise<void> {
    await clearStore(STORES.BRANDS);
  },
};

// ============================================
// Connections Cache API
// ============================================

function getConnectionsCacheKey(tenantId: string, brandId: string): string {
  return `connections:${tenantId}:${brandId}`;
}

export const connectionsCache = {
  async get(tenantId: string, brandId: string): Promise<PlatformConnection[] | null> {
    const key = getConnectionsCacheKey(tenantId, brandId);
    return get<PlatformConnection[]>(STORES.CONNECTIONS, key);
  },

  async set(tenantId: string, brandId: string, connections: PlatformConnection[]): Promise<void> {
    const key = getConnectionsCacheKey(tenantId, brandId);
    await set(STORES.CONNECTIONS, key, connections, TTL.CONNECTIONS);
  },

  async invalidate(tenantId: string, brandId: string): Promise<void> {
    const key = getConnectionsCacheKey(tenantId, brandId);
    await del(STORES.CONNECTIONS, key);
  },

  async clear(): Promise<void> {
    await clearStore(STORES.CONNECTIONS);
  },
};

// ============================================
// Utility functions
// ============================================

/**
 * Clear all cached data
 */
export async function clearAllCaches(): Promise<void> {
  await Promise.all([sessionsCache.clear(), brandsCache.clear(), connectionsCache.clear()]);
  cacheLogger.info('All caches cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  available: boolean;
  stores: Record<string, number>;
}> {
  const database = await initDB();

  if (!database) {
    return { available: false, stores: {} };
  }

  const stats: Record<string, number> = {};

  for (const storeName of Object.values(STORES)) {
    try {
      const transaction = database.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();

      await new Promise<void>((resolve) => {
        countRequest.onsuccess = () => {
          stats[storeName] = countRequest.result;
          resolve();
        };
        countRequest.onerror = () => {
          stats[storeName] = 0;
          resolve();
        };
      });
    } catch {
      stats[storeName] = 0;
    }
  }

  return { available: true, stores: stats };
}

// ============================================
// Initialization
// ============================================

// Initialize database on module load
initDB().catch(() => {});

// Run cleanup periodically (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      cleanupExpiredEntries().catch(() => {});
    },
    5 * 60 * 1000
  );
}

// Export for testing
export const __testing__ = {
  initDB,
  get,
  set,
  del,
  clearStore,
  cleanupExpiredEntries,
};
