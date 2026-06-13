import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentSession, Brand, PlatformConnection, Tenant } from '../types';

type CacheModule = typeof import('./cache');

interface StoredEntry {
  key: string;
  data: unknown;
  timestamp: number;
  expiresAt: number;
}

// ============================================
// Functional in-memory IndexedDB mock
// ============================================

class MockIDBRequest<T> {
  result: T | undefined;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: ((event: unknown) => void) | null = null;

  succeed(result: T) {
    this.result = result;
    this.onsuccess?.();
  }

  fail(error: Error) {
    this.error = error;
    this.onerror?.();
  }
}

class MockIDBObjectStore {
  data = new Map<string, StoredEntry>();

  put(value: StoredEntry) {
    const request = new MockIDBRequest<void>();
    setTimeout(() => {
      this.data.set(value.key, value);
      request.succeed(undefined);
    }, 0);
    return request;
  }

  get(key: string) {
    const request = new MockIDBRequest<unknown>();
    setTimeout(() => {
      request.succeed(this.data.get(key));
    }, 0);
    return request;
  }

  delete(key: string) {
    const request = new MockIDBRequest<void>();
    setTimeout(() => {
      this.data.delete(key);
      request.succeed(undefined);
    }, 0);
    return request;
  }

  clear() {
    const request = new MockIDBRequest<void>();
    setTimeout(() => {
      this.data.clear();
      request.succeed(undefined);
    }, 0);
    return request;
  }

  count() {
    const request = new MockIDBRequest<number>();
    setTimeout(() => {
      request.succeed(this.data.size);
    }, 0);
    return request;
  }

  createIndex(_name: string, _keyPath: string, _options?: unknown) {
    return new MockIDBIndex(this);
  }

  index(_name: string) {
    return new MockIDBIndex(this);
  }
}

// Supports the `expiresAt` index used by cleanupExpiredEntries.
class MockIDBIndex {
  constructor(private store: MockIDBObjectStore) {}

  openCursor(range: { upper: number }) {
    const request = new MockIDBRequest<unknown>();
    const expired = [...this.store.data.values()].filter((entry) => entry.expiresAt <= range.upper);
    let i = 0;

    const advance = () => {
      setTimeout(() => {
        if (i < expired.length) {
          const entry = expired[i++];
          request.succeed({
            delete: () => this.store.data.delete(entry.key),
            continue: advance,
          });
        } else {
          request.succeed(null);
        }
      }, 0);
    };

    advance();
    return request;
  }
}

class MockIDBDatabase {
  stores = new Map<string, MockIDBObjectStore>();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, _options?: unknown) {
    const store = new MockIDBObjectStore();
    this.stores.set(name, store);
    return store;
  }

  transaction(_storeNames: string | string[], _mode?: string) {
    return {
      objectStore: (name: string) => {
        if (!this.stores.has(name)) {
          this.stores.set(name, new MockIDBObjectStore());
        }
        return this.stores.get(name)!;
      },
    };
  }
}

function installMockIndexedDB(db: MockIDBDatabase, options: { failOpen?: boolean } = {}) {
  (globalThis as Record<string, unknown>).indexedDB = {
    open: vi.fn(() => {
      const request = new MockIDBRequest<MockIDBDatabase>();
      setTimeout(() => {
        if (options.failOpen) {
          request.fail(new Error('open denied'));
          return;
        }
        request.onupgradeneeded?.({ target: { result: db } });
        request.succeed(db);
      }, 0);
      return request;
    }),
  };
  (globalThis as Record<string, unknown>).IDBKeyRange = {
    upperBound: (upper: number) => ({ upper }),
  };
}

// Loads a fresh copy of the cache module so its module-level db handle
// picks up the mock installed by the current test.
async function loadCache(): Promise<CacheModule> {
  vi.resetModules();
  return import('./cache');
}

// ============================================
// Fixtures
// ============================================

const mockSession: AgentSession = {
  id: 'session_1',
  tenant_id: 'tenant_1',
  brand_id: 'brand_1',
  agent_type: 'response',
  status: 'running',
  config: {
    loop_interval_ms: 1000,
    max_iterations: 100,
    iteration_timeout_secs: 30,
    pause_on_error: false,
    mcp_servers: [],
    model: 'claude-3-opus',
    temperature: 0.7,
  },
  metrics: {
    loop_count: 10,
    tokens_used: 1000,
    tool_calls: 50,
    errors: 0,
    messages_sent: 20,
    uptime_seconds: 3600,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockBrand: Brand = {
  id: 'brand_1',
  tenant_id: 'tenant_1',
  slug: 'acme',
  name: 'Acme',
  support_platform: 'zendesk',
  ecommerce_platform: 'shopify',
  config: {},
  mcp_servers: [],
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
};

const mockTenant: Tenant = {
  id: 'tenant_1',
  name: 'Acme Inc',
  slug: 'acme-inc',
  tier: 'pro',
  created_at: '2026-01-01T00:00:00Z',
};

const mockConnection: PlatformConnection = {
  platform: 'shopify',
  connected: true,
  fields: [],
};

// ============================================
// Tests
// ============================================

describe('cache', () => {
  let mockDB: MockIDBDatabase;
  let originalIndexedDB: typeof indexedDB | undefined;
  let originalIDBKeyRange: typeof IDBKeyRange | undefined;

  beforeEach(() => {
    originalIndexedDB = globalThis.indexedDB;
    originalIDBKeyRange = globalThis.IDBKeyRange;
    mockDB = new MockIDBDatabase();
    installMockIndexedDB(mockDB);
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).indexedDB = originalIndexedDB;
    (globalThis as Record<string, unknown>).IDBKeyRange = originalIDBKeyRange;
    vi.restoreAllMocks();
  });

  describe('sessionsCache', () => {
    it('returns null when no data is cached', async () => {
      const { sessionsCache } = await loadCache();
      const result = await sessionsCache.get('tenant_1', 'brand_1');
      expect(result).toBeNull();
    });

    it('round-trips session lists keyed by tenant and brand', async () => {
      const { sessionsCache } = await loadCache();

      await sessionsCache.set('tenant_1', 'brand_1', [mockSession]);

      expect(await sessionsCache.get('tenant_1', 'brand_1')).toEqual([mockSession]);
      expect(mockDB.stores.get('sessions')?.data.has('sessions:tenant_1:brand_1')).toBe(true);
      // Different tenant/brand combinations do not collide
      expect(await sessionsCache.get('tenant_1', 'brand_2')).toBeNull();
      expect(await sessionsCache.get('tenant_2', 'brand_1')).toBeNull();
    });

    it('round-trips tenant-only session lists', async () => {
      const { sessionsCache } = await loadCache();

      await sessionsCache.set('tenant_1', undefined, [mockSession]);

      expect(await sessionsCache.get('tenant_1')).toEqual([mockSession]);
      expect(mockDB.stores.get('sessions')?.data.has('sessions:tenant_1')).toBe(true);
    });

    it('round-trips single sessions by id', async () => {
      const { sessionsCache } = await loadCache();

      await sessionsCache.setSession(mockSession);

      expect(await sessionsCache.getSession('session_1')).toEqual(mockSession);
      expect(await sessionsCache.getSession('missing')).toBeNull();
    });

    it('invalidate removes only the targeted entry', async () => {
      const { sessionsCache } = await loadCache();
      await sessionsCache.set('tenant_1', 'brand_1', [mockSession]);
      await sessionsCache.set('tenant_1', undefined, [mockSession]);

      await sessionsCache.invalidate('tenant_1', 'brand_1');

      expect(await sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      expect(await sessionsCache.get('tenant_1')).toEqual([mockSession]);
    });

    it('clear empties the sessions store', async () => {
      const { sessionsCache } = await loadCache();
      await sessionsCache.set('tenant_1', 'brand_1', [mockSession]);
      await sessionsCache.setSession(mockSession);

      await sessionsCache.clear();

      expect(await sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      expect(await sessionsCache.getSession('session_1')).toBeNull();
    });
  });

  describe('brandsCache', () => {
    it('round-trips, invalidates, and clears brand lists', async () => {
      const { brandsCache } = await loadCache();

      await brandsCache.set('tenant_1', [mockBrand]);
      expect(await brandsCache.get('tenant_1')).toEqual([mockBrand]);

      await brandsCache.invalidate('tenant_1');
      expect(await brandsCache.get('tenant_1')).toBeNull();

      await brandsCache.set('tenant_1', [mockBrand]);
      await brandsCache.clear();
      expect(await brandsCache.get('tenant_1')).toBeNull();
    });
  });

  describe('connectionsCache', () => {
    it('round-trips connections keyed by tenant and brand', async () => {
      const { connectionsCache } = await loadCache();

      await connectionsCache.set('tenant_1', 'brand_1', [mockConnection]);

      expect(await connectionsCache.get('tenant_1', 'brand_1')).toEqual([mockConnection]);
      expect(await connectionsCache.get('tenant_1', 'brand_2')).toBeNull();

      await connectionsCache.invalidate('tenant_1', 'brand_1');
      expect(await connectionsCache.get('tenant_1', 'brand_1')).toBeNull();
    });
  });

  describe('authContextCache', () => {
    it('round-trips and clears the auth context', async () => {
      const { authContextCache } = await loadCache();
      const context = { tenant: mockTenant, brands: [mockBrand] };

      await authContextCache.set(context);
      expect(await authContextCache.get()).toEqual(context);

      await authContextCache.clear();
      expect(await authContextCache.get()).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('returns null for expired entries and deletes them lazily', async () => {
      const cache = await loadCache();
      const { __testing__ } = cache;

      await __testing__.set('sessions', 'expired-key', { value: 1 }, -10);
      const result = await __testing__.get('sessions', 'expired-key');

      expect(result).toBeNull();
      // Lazy delete is fired asynchronously
      await vi.waitFor(() => {
        expect(mockDB.stores.get('sessions')?.data.has('expired-key')).toBe(false);
      });
    });

    it('returns data for entries that have not expired', async () => {
      const { __testing__ } = await loadCache();

      await __testing__.set('sessions', 'fresh-key', { value: 42 }, 60_000);

      expect(await __testing__.get('sessions', 'fresh-key')).toEqual({ value: 42 });
      const entry = mockDB.stores.get('sessions')?.data.get('fresh-key');
      expect(entry?.expiresAt).toBeGreaterThan(Date.now());
      expect(entry?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('cleanupExpiredEntries removes only expired rows', async () => {
      const { __testing__ } = await loadCache();

      await __testing__.set('sessions', 'stale', { value: 1 }, -10);
      await __testing__.set('sessions', 'live', { value: 2 }, 60_000);
      await __testing__.set('brands', 'stale-brand', { value: 3 }, -10);

      await __testing__.cleanupExpiredEntries();

      expect(mockDB.stores.get('sessions')?.data.has('stale')).toBe(false);
      expect(mockDB.stores.get('sessions')?.data.has('live')).toBe(true);
      expect(mockDB.stores.get('brands')?.data.has('stale-brand')).toBe(false);
    });
  });

  describe('clearAllCaches', () => {
    it('clears every store', async () => {
      const cache = await loadCache();

      await cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession]);
      await cache.brandsCache.set('tenant_1', [mockBrand]);
      await cache.connectionsCache.set('tenant_1', 'brand_1', [mockConnection]);
      await cache.authContextCache.set({ tenant: mockTenant, brands: [mockBrand] });

      await cache.clearAllCaches();

      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      expect(await cache.brandsCache.get('tenant_1')).toBeNull();
      expect(await cache.connectionsCache.get('tenant_1', 'brand_1')).toBeNull();
      expect(await cache.authContextCache.get()).toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('reports per-store entry counts', async () => {
      const cache = await loadCache();

      await cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession]);
      await cache.sessionsCache.setSession(mockSession);
      await cache.brandsCache.set('tenant_1', [mockBrand]);

      const stats = await cache.getCacheStats();

      expect(stats.available).toBe(true);
      expect(stats.stores).toEqual({
        sessions: 2,
        brands: 1,
        connections: 0,
        metadata: 0,
      });
    });
  });

  describe('error resilience', () => {
    it('degrades gracefully when indexedDB is unavailable', async () => {
      (globalThis as Record<string, unknown>).indexedDB = undefined;
      const cache = await loadCache();

      await expect(
        cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession])
      ).resolves.toBeUndefined();
      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      await expect(cache.clearAllCaches()).resolves.toBeUndefined();
      expect(await cache.getCacheStats()).toEqual({ available: false, stores: {} });
    });

    it('degrades gracefully when opening the database fails', async () => {
      installMockIndexedDB(mockDB, { failOpen: true });
      const cache = await loadCache();

      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      await expect(
        cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession])
      ).resolves.toBeUndefined();
      expect(await cache.getCacheStats()).toEqual({ available: false, stores: {} });
    });

    it('resolves null/void when a transaction throws', async () => {
      const cache = await loadCache();
      // Ensure the db handle is initialized before sabotaging transactions
      await cache.sessionsCache.get('tenant_1');

      mockDB.transaction = () => {
        throw new Error('transaction unavailable');
      };

      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
      await expect(
        cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession])
      ).resolves.toBeUndefined();
      await expect(cache.sessionsCache.invalidate('tenant_1', 'brand_1')).resolves.toBeUndefined();
      await expect(cache.sessionsCache.clear()).resolves.toBeUndefined();
      await expect(cache.__testing__.cleanupExpiredEntries()).resolves.toBeUndefined();
      expect(await cache.getCacheStats()).toEqual({
        available: true,
        stores: { sessions: 0, brands: 0, connections: 0, metadata: 0 },
      });
    });

    it('resolves null when a get request errors', async () => {
      const cache = await loadCache();
      await cache.sessionsCache.get('tenant_1');

      const store = mockDB.stores.get('sessions')!;
      store.get = () => {
        const request = new MockIDBRequest<unknown>();
        setTimeout(() => request.fail(new Error('read error')), 0);
        return request;
      };

      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
    });

    it('resolves when a put request errors', async () => {
      const cache = await loadCache();
      await cache.sessionsCache.get('tenant_1');

      const store = mockDB.stores.get('sessions')!;
      store.put = () => {
        const request = new MockIDBRequest<void>();
        setTimeout(() => request.fail(new Error('write error')), 0);
        return request;
      };

      await expect(
        cache.sessionsCache.set('tenant_1', 'brand_1', [mockSession])
      ).resolves.toBeUndefined();
      expect(await cache.sessionsCache.get('tenant_1', 'brand_1')).toBeNull();
    });
  });

  describe('schema initialization', () => {
    it('creates the expected object stores on upgrade', async () => {
      const cache = await loadCache();
      await cache.sessionsCache.get('tenant_1');

      expect(mockDB.objectStoreNames.contains('sessions')).toBe(true);
      expect(mockDB.objectStoreNames.contains('brands')).toBe(true);
      expect(mockDB.objectStoreNames.contains('connections')).toBe(true);
      expect(mockDB.objectStoreNames.contains('metadata')).toBe(true);
    });

    it('reuses the database handle across operations (single open)', async () => {
      const cache = await loadCache();

      await cache.sessionsCache.get('tenant_1');
      await cache.brandsCache.get('tenant_1');
      await cache.getCacheStats();

      const openMock = (globalThis.indexedDB as unknown as { open: ReturnType<typeof vi.fn> }).open;
      expect(openMock).toHaveBeenCalledTimes(1);
      expect(openMock).toHaveBeenCalledWith('stateset-cache', 1);
    });
  });
});
