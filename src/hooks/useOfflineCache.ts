/**
 * Offline Cache Hook
 *
 * Integrates IndexedDB caching with React Query for offline-first data fetching.
 * Provides cached data when offline and syncs with server when online.
 */

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  sessionsCache,
  brandsCache,
  connectionsCache,
  clearAllCaches,
  getCacheStats,
} from '../lib/cache';
import { queryKeys } from '../lib/queryKeys';
import { cacheLogger } from '../lib/logger';
import type { AgentSession, Brand, PlatformConnection } from '../types';

/**
 * Hook to track online/offline status
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => {
      cacheLogger.info('Network status: online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      cacheLogger.warn('Network status: offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to cache and retrieve sessions
 */
export function useSessionsCache(tenantId: string | undefined, brandId: string | undefined) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  // Populate cache from query data
  const cacheFromQuery = useCallback(
    async (sessions: AgentSession[]) => {
      if (!tenantId) return;
      await sessionsCache.set(tenantId, brandId, sessions);
      cacheLogger.debug('Sessions cached from query', {
        tenantId,
        brandId,
        count: sessions.length,
      });
    },
    [tenantId, brandId]
  );

  // Get cached data when offline
  const getCachedSessions = useCallback(async (): Promise<AgentSession[] | null> => {
    if (!tenantId) return null;
    const cached = await sessionsCache.get(tenantId, brandId);
    if (cached) {
      cacheLogger.info('Using cached sessions', {
        tenantId,
        brandId,
        count: cached.length,
      });
    }
    return cached;
  }, [tenantId, brandId]);

  // Hydrate query from cache on mount (for offline support)
  useEffect(() => {
    if (!isOnline && tenantId) {
      getCachedSessions().then((cached) => {
        if (cached) {
          queryClient.setQueryData(queryKeys.sessions.list(tenantId, brandId), cached);
        }
      });
    }
  }, [isOnline, tenantId, brandId, queryClient, getCachedSessions]);

  // Invalidate cache
  const invalidateCache = useCallback(async () => {
    if (!tenantId) return;
    await sessionsCache.invalidate(tenantId, brandId);
    cacheLogger.debug('Sessions cache invalidated', { tenantId, brandId });
  }, [tenantId, brandId]);

  return {
    isOnline,
    cacheFromQuery,
    getCachedSessions,
    invalidateCache,
  };
}

/**
 * Hook to cache and retrieve brands
 */
export function useBrandsCache(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const cacheFromQuery = useCallback(
    async (brands: Brand[]) => {
      if (!tenantId) return;
      await brandsCache.set(tenantId, brands);
      cacheLogger.debug('Brands cached from query', {
        tenantId,
        count: brands.length,
      });
    },
    [tenantId]
  );

  const getCachedBrands = useCallback(async (): Promise<Brand[] | null> => {
    if (!tenantId) return null;
    const cached = await brandsCache.get(tenantId);
    if (cached) {
      cacheLogger.info('Using cached brands', {
        tenantId,
        count: cached.length,
      });
    }
    return cached;
  }, [tenantId]);

  useEffect(() => {
    if (!isOnline && tenantId) {
      getCachedBrands().then((cached) => {
        if (cached) {
          queryClient.setQueryData(queryKeys.brands.list(tenantId), cached);
        }
      });
    }
  }, [isOnline, tenantId, queryClient, getCachedBrands]);

  const invalidateCache = useCallback(async () => {
    if (!tenantId) return;
    await brandsCache.invalidate(tenantId);
    cacheLogger.debug('Brands cache invalidated', { tenantId });
  }, [tenantId]);

  return {
    isOnline,
    cacheFromQuery,
    getCachedBrands,
    invalidateCache,
  };
}

/**
 * Hook to cache and retrieve connections
 */
export function useConnectionsCache(tenantId: string | undefined, brandId: string | undefined) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const cacheFromQuery = useCallback(
    async (connections: PlatformConnection[]) => {
      if (!tenantId || !brandId) return;
      await connectionsCache.set(tenantId, brandId, connections);
      cacheLogger.debug('Connections cached from query', {
        tenantId,
        brandId,
        count: connections.length,
      });
    },
    [tenantId, brandId]
  );

  const getCachedConnections = useCallback(async (): Promise<PlatformConnection[] | null> => {
    if (!tenantId || !brandId) return null;
    const cached = await connectionsCache.get(tenantId, brandId);
    if (cached) {
      cacheLogger.info('Using cached connections', {
        tenantId,
        brandId,
        count: cached.length,
      });
    }
    return cached;
  }, [tenantId, brandId]);

  useEffect(() => {
    if (!isOnline && tenantId && brandId) {
      getCachedConnections().then((cached) => {
        if (cached) {
          queryClient.setQueryData(queryKeys.connections.list(tenantId, brandId), cached);
        }
      });
    }
  }, [isOnline, tenantId, brandId, queryClient, getCachedConnections]);

  const invalidateCache = useCallback(async () => {
    if (!tenantId || !brandId) return;
    await connectionsCache.invalidate(tenantId, brandId);
    cacheLogger.debug('Connections cache invalidated', { tenantId, brandId });
  }, [tenantId, brandId]);

  return {
    isOnline,
    cacheFromQuery,
    getCachedConnections,
    invalidateCache,
  };
}

/**
 * Hook to manage all caches
 */
export function useCacheManager() {
  const [stats, setStats] = useState<{
    available: boolean;
    stores: Record<string, number>;
  } | null>(null);

  const refresh = useCallback(async () => {
    const newStats = await getCacheStats();
    setStats(newStats);
    return newStats;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearAllCaches();
    await refresh();
    cacheLogger.info('All caches cleared by user');
  }, [refresh]);

  return {
    stats,
    refresh,
    clearAll,
  };
}
