/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOnlineStatus,
  useSessionsCache,
  useBrandsCache,
  useConnectionsCache,
  useCacheManager,
} from './useOfflineCache';
import { queryKeys } from '../lib/queryKeys';
import {
  sessionsCache,
  brandsCache,
  connectionsCache,
  clearAllCaches,
  getCacheStats,
} from '../lib/cache';
import type { AgentSession, Brand, PlatformConnection } from '../types';

// --- Mocks ---

vi.mock('../lib/cache', () => ({
  sessionsCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  },
  brandsCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  },
  connectionsCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  },
  clearAllCaches: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn().mockResolvedValue({ available: true, stores: { sessions: 2 } }),
}));

vi.mock('../lib/logger', () => ({
  cacheLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSessions = [{ id: 's1', status: 'running' }] as unknown as AgentSession[];
const mockBrands = [{ id: 'b1', name: 'Brand One' }] as unknown as Brand[];
const mockConnections = [{ id: 'c1', platform: 'shopify' }] as unknown as PlatformConnection[];

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

let onlineGetter: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  onlineGetter = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  onlineGetter.mockRestore();
});

describe('useOnlineStatus (offline cache variant)', () => {
  it('reflects navigator.onLine and reacts to online/offline events', () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});

describe('useSessionsCache', () => {
  it('writes sessions to the cache via cacheFromQuery', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useSessionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.cacheFromQuery(mockSessions);
    });

    expect(sessionsCache.set).toHaveBeenCalledWith('tenant-1', 'brand-1', mockSessions);
  });

  it('skips cache writes when tenantId is missing', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useSessionsCache(undefined, 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.cacheFromQuery(mockSessions);
    });

    expect(sessionsCache.set).not.toHaveBeenCalled();
  });

  it('reads cached sessions via getCachedSessions', async () => {
    vi.mocked(sessionsCache.get).mockResolvedValue(mockSessions);
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useSessionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    let cached: AgentSession[] | null = null;
    await act(async () => {
      cached = await result.current.getCachedSessions();
    });

    expect(sessionsCache.get).toHaveBeenCalledWith('tenant-1', 'brand-1');
    expect(cached).toEqual(mockSessions);
  });

  it('returns null from getCachedSessions without a tenant', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useSessionsCache(undefined, undefined), {
      wrapper: createWrapper(queryClient),
    });

    let cached: AgentSession[] | null = mockSessions;
    await act(async () => {
      cached = await result.current.getCachedSessions();
    });

    expect(cached).toBeNull();
    expect(sessionsCache.get).not.toHaveBeenCalled();
  });

  it('hydrates the query cache from IndexedDB when offline', async () => {
    onlineGetter.mockReturnValue(false);
    vi.mocked(sessionsCache.get).mockResolvedValue(mockSessions);
    const queryClient = newQueryClient();

    const { result } = renderHook(() => useSessionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isOnline).toBe(false);
    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.sessions.list('tenant-1', 'brand-1'))).toEqual(
        mockSessions
      );
    });
  });

  it('does not hydrate from the cache while online', async () => {
    onlineGetter.mockReturnValue(true);
    vi.mocked(sessionsCache.get).mockResolvedValue(mockSessions);
    const queryClient = newQueryClient();

    renderHook(() => useSessionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(sessionsCache.get).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(queryKeys.sessions.list('tenant-1', 'brand-1'))
    ).toBeUndefined();
  });

  it('invalidates the cache for the current tenant and brand', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useSessionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.invalidateCache();
    });

    expect(sessionsCache.invalidate).toHaveBeenCalledWith('tenant-1', 'brand-1');
  });
});

describe('useBrandsCache', () => {
  it('writes and invalidates the brands cache', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useBrandsCache('tenant-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.cacheFromQuery(mockBrands);
      await result.current.invalidateCache();
    });

    expect(brandsCache.set).toHaveBeenCalledWith('tenant-1', mockBrands);
    expect(brandsCache.invalidate).toHaveBeenCalledWith('tenant-1');
  });

  it('hydrates the brands query from the cache when offline', async () => {
    onlineGetter.mockReturnValue(false);
    vi.mocked(brandsCache.get).mockResolvedValue(mockBrands);
    const queryClient = newQueryClient();

    renderHook(() => useBrandsCache('tenant-1'), { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.brands.list('tenant-1'))).toEqual(mockBrands);
    });
  });
});

describe('useConnectionsCache', () => {
  it('requires both tenantId and brandId to cache connections', async () => {
    const queryClient = newQueryClient();
    const noBrand = renderHook(() => useConnectionsCache('tenant-1', undefined), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await noBrand.result.current.cacheFromQuery(mockConnections);
    });
    expect(connectionsCache.set).not.toHaveBeenCalled();

    const withBoth = renderHook(() => useConnectionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await withBoth.result.current.cacheFromQuery(mockConnections);
    });
    expect(connectionsCache.set).toHaveBeenCalledWith('tenant-1', 'brand-1', mockConnections);
  });

  it('hydrates the connections query from the cache when offline', async () => {
    onlineGetter.mockReturnValue(false);
    vi.mocked(connectionsCache.get).mockResolvedValue(mockConnections);
    const queryClient = newQueryClient();

    renderHook(() => useConnectionsCache('tenant-1', 'brand-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.connections.list('tenant-1', 'brand-1'))).toEqual(
        mockConnections
      );
    });
  });
});

describe('useCacheManager', () => {
  it('loads cache stats on mount', async () => {
    const { result } = renderHook(() => useCacheManager());

    await waitFor(() => {
      expect(result.current.stats).toEqual({ available: true, stores: { sessions: 2 } });
    });
    expect(getCacheStats).toHaveBeenCalledTimes(1);
  });

  it('clears all caches and refreshes stats', async () => {
    vi.mocked(getCacheStats)
      .mockResolvedValueOnce({ available: true, stores: { sessions: 2 } })
      .mockResolvedValueOnce({ available: true, stores: {} });

    const { result } = renderHook(() => useCacheManager());
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });

    await act(async () => {
      await result.current.clearAll();
    });

    expect(clearAllCaches).toHaveBeenCalledTimes(1);
    expect(getCacheStats).toHaveBeenCalledTimes(2);
    expect(result.current.stats).toEqual({ available: true, stores: {} });
  });
});
