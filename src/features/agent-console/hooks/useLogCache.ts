import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '../../../stores/auth';
import type { LogEntry } from '../../../components/LogsViewer';
import { LOG_CACHE_LIMIT, LOG_CACHE_PREFIX, LOG_CACHE_TTL_MS, LOG_STORE_KEY } from '../constants';

// ── Normalization helpers ─────────────────────────────────────────────

type LogCacheEntry = {
  updatedAt: number;
  logs: LogEntry[];
};

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const normalizeLogCacheEntry = (value: unknown): LogCacheEntry | null => {
  if (Array.isArray(value)) {
    return { updatedAt: Date.now(), logs: value as LogEntry[] };
  }
  if (value && typeof value === 'object') {
    const record = value as { updatedAt?: unknown; logs?: unknown };
    if (Array.isArray(record.logs)) {
      const updatedAt =
        typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
          ? record.updatedAt
          : Date.now();
      return { updatedAt, logs: record.logs as LogEntry[] };
    }
  }
  return null;
};

const normalizeLogCacheMap = (value: unknown): Record<string, LogCacheEntry> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, LogCacheEntry> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeLogCacheEntry(entry);
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
};

const pruneLogCacheMap = (map: Record<string, LogCacheEntry>, now: number): boolean => {
  let changed = false;
  for (const [key, entry] of Object.entries(map)) {
    if (now - entry.updatedAt > LOG_CACHE_TTL_MS) {
      delete map[key];
      changed = true;
    }
  }
  return changed;
};

const inMemoryLogCache = new Map<string, LogCacheEntry>();

const getInMemoryLogCache = (key: string | null, now: number): LogEntry[] | null => {
  if (!key) return null;
  const cached = inMemoryLogCache.get(key);
  if (!cached) return null;
  if (now - cached.updatedAt > LOG_CACHE_TTL_MS) {
    inMemoryLogCache.delete(key);
    return null;
  }
  return cached.logs;
};

const setInMemoryLogCache = (key: string | null, logs: LogEntry[], now = Date.now()): void => {
  if (!key) return;
  inMemoryLogCache.set(key, { updatedAt: now, logs });
};

const clearInMemoryLogCache = (key: string | null): void => {
  if (!key) return;
  inMemoryLogCache.delete(key);
};

// ── Hook ──────────────────────────────────────────────────────────────

interface UseLogCacheOptions {
  sessionId: string | undefined;
}

export function useLogCache({ sessionId }: UseLogCacheOptions) {
  const { tenant, currentBrand } = useAuthStore();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasCachedLogs, setHasCachedLogs] = useState(false);

  const logCacheKey =
    tenant?.id && currentBrand?.id && sessionId
      ? `${LOG_CACHE_PREFIX}:${tenant.id}:${currentBrand.id}:${sessionId}`
      : null;

  const addLogEntry = useCallback(
    (
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      source?: string,
      details?: Record<string, unknown>
    ) => {
      setLogs((prev) => {
        const next = [
          ...prev,
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
            level,
            message,
            source,
            details,
          },
        ];
        return next.length > LOG_CACHE_LIMIT ? next.slice(-LOG_CACHE_LIMIT) : next;
      });
    },
    []
  );

  const readLogCache = useCallback(async (): Promise<LogEntry[] | null> => {
    if (!logCacheKey || typeof window === 'undefined') return null;

    const now = Date.now();

    if (window.electronAPI?.store) {
      try {
        const raw = await window.electronAPI.store.get(LOG_STORE_KEY);
        const map = normalizeLogCacheMap(raw);
        const didPrune = pruneLogCacheMap(map, now);
        const cached = map[logCacheKey]?.logs;

        if (didPrune) {
          if (Object.keys(map).length === 0) {
            await window.electronAPI.store.delete(LOG_STORE_KEY);
          } else {
            await window.electronAPI.store.set(LOG_STORE_KEY, map);
          }
        }

        if (cached) {
          setInMemoryLogCache(logCacheKey, cached, now);
          return cached;
        }

        clearInMemoryLogCache(logCacheKey);
        return null;
      } catch {
        return getInMemoryLogCache(logCacheKey, now);
      }
    }

    const sessionStorage = getSessionStorage();
    const localStorage = getLocalStorage();

    try {
      let raw: string | null = null;
      let source: Storage | null = null;

      if (sessionStorage) {
        raw = sessionStorage.getItem(logCacheKey);
        if (raw) source = sessionStorage;
      }

      if (!raw && localStorage) {
        raw = localStorage.getItem(logCacheKey);
        if (raw) source = localStorage;
      }

      if (!raw || !source) {
        return getInMemoryLogCache(logCacheKey, now);
      }

      const parsed = JSON.parse(raw) as unknown;
      const entry = normalizeLogCacheEntry(parsed);
      if (!entry) {
        sessionStorage?.removeItem(logCacheKey);
        localStorage?.removeItem(logCacheKey);
        clearInMemoryLogCache(logCacheKey);
        return null;
      }

      if (now - entry.updatedAt > LOG_CACHE_TTL_MS) {
        sessionStorage?.removeItem(logCacheKey);
        localStorage?.removeItem(logCacheKey);
        clearInMemoryLogCache(logCacheKey);
        return null;
      }

      const shouldNormalize =
        Array.isArray(parsed) || typeof (parsed as { updatedAt?: unknown }).updatedAt !== 'number';
      const shouldMigrate = source === localStorage && Boolean(sessionStorage);

      if (shouldNormalize || shouldMigrate) {
        if (sessionStorage) {
          sessionStorage.setItem(logCacheKey, JSON.stringify(entry));
        } else if (localStorage) {
          localStorage.setItem(logCacheKey, JSON.stringify(entry));
        }
        if (localStorage && shouldMigrate) {
          localStorage.removeItem(logCacheKey);
        }
      } else if (source === sessionStorage && localStorage?.getItem(logCacheKey)) {
        localStorage.removeItem(logCacheKey);
      }

      setInMemoryLogCache(logCacheKey, entry.logs, now);
      return entry.logs;
    } catch {
      const sessionStorage = getSessionStorage();
      const localStorage = getLocalStorage();
      sessionStorage?.removeItem(logCacheKey);
      localStorage?.removeItem(logCacheKey);
      clearInMemoryLogCache(logCacheKey);
      return getInMemoryLogCache(logCacheKey, now);
    }
  }, [logCacheKey]);

  const persistLogCache = useCallback(
    async (entries: LogEntry[]) => {
      if (!logCacheKey || typeof window === 'undefined') return;

      if (window.electronAPI?.store) {
        try {
          const now = Date.now();
          const raw = await window.electronAPI.store.get(LOG_STORE_KEY);
          const map = normalizeLogCacheMap(raw);
          pruneLogCacheMap(map, now);

          if (entries.length === 0) {
            delete map[logCacheKey];
            clearInMemoryLogCache(logCacheKey);
          } else {
            map[logCacheKey] = { updatedAt: now, logs: entries };
            setInMemoryLogCache(logCacheKey, entries, now);
          }

          if (Object.keys(map).length === 0) {
            await window.electronAPI.store.delete(LOG_STORE_KEY);
          } else {
            await window.electronAPI.store.set(LOG_STORE_KEY, map);
          }
          return;
        } catch {
          if (entries.length === 0) {
            clearInMemoryLogCache(logCacheKey);
          } else {
            setInMemoryLogCache(logCacheKey, entries, Date.now());
          }
          return;
        }
      }

      const now = Date.now();
      const cacheEntry: LogCacheEntry = { updatedAt: now, logs: entries };
      const sessionStorage = getSessionStorage();
      const localStorage = getLocalStorage();

      if (entries.length === 0) {
        clearInMemoryLogCache(logCacheKey);
        sessionStorage?.removeItem(logCacheKey);
        localStorage?.removeItem(logCacheKey);
        return;
      }

      if (sessionStorage) {
        sessionStorage.setItem(logCacheKey, JSON.stringify(cacheEntry));
        localStorage?.removeItem(logCacheKey);
      } else if (localStorage) {
        localStorage.setItem(logCacheKey, JSON.stringify(cacheEntry));
      }
      setInMemoryLogCache(logCacheKey, entries, now);
    },
    [logCacheKey]
  );

  // Hydrate cached log indicator on mount
  useEffect(() => {
    if (!logCacheKey) return;
    let cancelled = false;
    void (async () => {
      const cached = await readLogCache();
      if (!cancelled) {
        setHasCachedLogs(Boolean(cached && cached.length > 0));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logCacheKey, readLogCache]);

  // Persist logs whenever they change
  useEffect(() => {
    if (!logCacheKey) return;
    const trimmed = logs.slice(-LOG_CACHE_LIMIT);
    setHasCachedLogs(trimmed.length > 0);
    void (async () => {
      try {
        await persistLogCache(trimmed);
      } catch {
        setHasCachedLogs(false);
      }
    })();
  }, [logCacheKey, logs, persistLogCache]);

  return {
    logs,
    setLogs,
    hasCachedLogs,
    setHasCachedLogs,
    addLogEntry,
    readLogCache,
  };
}
