/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLogCache } from './useLogCache';
import { LOG_CACHE_LIMIT, LOG_CACHE_PREFIX, LOG_CACHE_TTL_MS, LOG_STORE_KEY } from '../constants';
import type { LogEntry } from '../../../components/LogsViewer';

vi.mock('../../../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    tenant: { id: 't1' },
    currentBrand: { id: 'b1' },
  })),
}));

const cacheKey = (sessionId: string) => `${LOG_CACHE_PREFIX}:t1:b1:${sessionId}`;

let logSeq = 0;
function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  logSeq += 1;
  return {
    id: `log-${logSeq}`,
    timestamp: Date.now(),
    level: 'info',
    message: `entry ${logSeq}`,
    ...overrides,
  };
}

function setElectronStore() {
  const store = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  };
  Object.defineProperty(window, 'electronAPI', {
    value: { store },
    configurable: true,
    writable: true,
  });
  return store;
}

function clearElectronAPI() {
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  clearElectronAPI();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useLogCache', () => {
  describe('addLogEntry', () => {
    it('appends a log entry with the given level, message, source and details', () => {
      const { result } = renderHook(() => useLogCache({ sessionId: undefined }));

      act(() => {
        result.current.addLogEntry('warn', 'something odd', 'stream', { code: 42 });
      });

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]).toMatchObject({
        level: 'warn',
        message: 'something odd',
        source: 'stream',
        details: { code: 42 },
      });
      expect(result.current.logs[0].id).toMatch(/^log-/);
      expect(typeof result.current.logs[0].timestamp).toBe('number');
    });

    it('trims the log list to the cache limit, keeping the newest entries', () => {
      const { result } = renderHook(() => useLogCache({ sessionId: undefined }));

      const seed = Array.from({ length: LOG_CACHE_LIMIT + 50 }, () => makeLog());
      act(() => {
        result.current.setLogs(seed);
      });
      act(() => {
        result.current.addLogEntry('info', 'the newest entry');
      });

      expect(result.current.logs).toHaveLength(LOG_CACHE_LIMIT);
      expect(result.current.logs[LOG_CACHE_LIMIT - 1].message).toBe('the newest entry');
    });
  });

  describe('without a complete cache key', () => {
    it('reports no cached logs and readLogCache resolves null', async () => {
      const { result } = renderHook(() => useLogCache({ sessionId: undefined }));
      await flushAsync();

      expect(result.current.hasCachedLogs).toBe(false);
      await expect(result.current.readLogCache()).resolves.toBeNull();
    });
  });

  describe('electron store backend', () => {
    it('hydrates hasCachedLogs from a cached entry on mount', async () => {
      const store = setElectronStore();
      store.get.mockResolvedValue({
        [cacheKey('es-hydrate')]: { updatedAt: Date.now(), logs: [makeLog()] },
      });

      const { result } = renderHook(() => useLogCache({ sessionId: 'es-hydrate' }));

      await waitFor(() => expect(result.current.hasCachedLogs).toBe(true));
      expect(store.get).toHaveBeenCalledWith(LOG_STORE_KEY);
    });

    it('does not wipe an existing cache just by mounting with no logs', async () => {
      const store = setElectronStore();
      store.get.mockResolvedValue({
        [cacheKey('es-nowipe')]: { updatedAt: Date.now(), logs: [makeLog()] },
      });

      const { result } = renderHook(() => useLogCache({ sessionId: 'es-nowipe' }));

      await waitFor(() => expect(result.current.hasCachedLogs).toBe(true));
      await flushAsync();

      expect(store.set).not.toHaveBeenCalled();
      expect(store.delete).not.toHaveBeenCalled();

      // The cached logs are still readable afterwards
      const cached = await result.current.readLogCache();
      expect(cached).toHaveLength(1);
    });

    it('returns cached logs from readLogCache', async () => {
      const store = setElectronStore();
      const logs = [makeLog({ message: 'restored' })];
      store.get.mockResolvedValue({
        [cacheKey('es-read')]: { updatedAt: Date.now(), logs },
      });

      const { result } = renderHook(() => useLogCache({ sessionId: 'es-read' }));
      await flushAsync();

      await expect(result.current.readLogCache()).resolves.toEqual(logs);
    });

    it('prunes expired entries and deletes the store key when empty', async () => {
      const store = setElectronStore();
      store.get.mockResolvedValue({
        [cacheKey('es-prune')]: {
          updatedAt: Date.now() - LOG_CACHE_TTL_MS - 1000,
          logs: [makeLog()],
        },
      });

      const { result } = renderHook(() => useLogCache({ sessionId: 'es-prune' }));
      await flushAsync();

      expect(result.current.hasCachedLogs).toBe(false);
      await waitFor(() => expect(store.delete).toHaveBeenCalledWith(LOG_STORE_KEY));
    });

    it('persists new log entries to the store', async () => {
      const store = setElectronStore();
      const { result } = renderHook(() => useLogCache({ sessionId: 'es-persist' }));
      await flushAsync();

      act(() => {
        result.current.addLogEntry('info', 'persist me');
      });

      await waitFor(() =>
        expect(store.set).toHaveBeenCalledWith(
          LOG_STORE_KEY,
          expect.objectContaining({
            [cacheKey('es-persist')]: expect.objectContaining({
              logs: [expect.objectContaining({ message: 'persist me' })],
            }),
          })
        )
      );
      expect(result.current.hasCachedLogs).toBe(true);
    });

    it('clears the cache when logs are cleared after being persisted', async () => {
      const store = setElectronStore();
      const { result } = renderHook(() => useLogCache({ sessionId: 'es-clear' }));
      await flushAsync();

      act(() => {
        result.current.addLogEntry('info', 'temp');
      });
      await waitFor(() => expect(store.set).toHaveBeenCalled());

      act(() => {
        result.current.setLogs([]);
      });

      await waitFor(() => expect(store.delete).toHaveBeenCalledWith(LOG_STORE_KEY));
      expect(result.current.hasCachedLogs).toBe(false);
    });

    it('falls back to the in-memory cache when the store is unavailable', async () => {
      const store = setElectronStore();
      store.get.mockRejectedValue(new Error('ipc broken'));

      const { result } = renderHook(() => useLogCache({ sessionId: 'es-memory' }));
      await flushAsync();

      act(() => {
        result.current.addLogEntry('error', 'kept in memory');
      });
      await flushAsync();

      const cached = await result.current.readLogCache();
      expect(cached).toEqual([expect.objectContaining({ message: 'kept in memory' })]);
    });
  });

  describe('web storage backend', () => {
    it('hydrates from sessionStorage', async () => {
      const key = cacheKey('ws-read');
      const logs = [makeLog({ message: 'from session storage' })];
      window.sessionStorage.setItem(key, JSON.stringify({ updatedAt: Date.now(), logs }));

      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-read' }));

      await waitFor(() => expect(result.current.hasCachedLogs).toBe(true));
      const cached = await result.current.readLogCache();
      expect(cached).toEqual([expect.objectContaining({ message: 'from session storage' })]);
    });

    it('normalizes the legacy bare-array format', async () => {
      const key = cacheKey('ws-legacy');
      window.sessionStorage.setItem(key, JSON.stringify([makeLog({ message: 'legacy' })]));

      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-legacy' }));

      await waitFor(() => expect(result.current.hasCachedLogs).toBe(true));

      const rewritten = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as {
        updatedAt: number;
        logs: LogEntry[];
      };
      expect(typeof rewritten.updatedAt).toBe('number');
      expect(rewritten.logs[0].message).toBe('legacy');
    });

    it('migrates entries from localStorage into sessionStorage', async () => {
      const key = cacheKey('ws-migrate');
      const entry = { updatedAt: Date.now(), logs: [makeLog({ message: 'migrated' })] };
      window.localStorage.setItem(key, JSON.stringify(entry));

      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-migrate' }));

      await waitFor(() => expect(result.current.hasCachedLogs).toBe(true));
      await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
      const migrated = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as {
        logs: LogEntry[];
      };
      expect(migrated.logs[0].message).toBe('migrated');
    });

    it('drops expired entries', async () => {
      const key = cacheKey('ws-expired');
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ updatedAt: Date.now() - LOG_CACHE_TTL_MS - 1000, logs: [makeLog()] })
      );

      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-expired' }));
      await flushAsync();

      expect(result.current.hasCachedLogs).toBe(false);
      expect(window.sessionStorage.getItem(key)).toBeNull();
      await expect(result.current.readLogCache()).resolves.toBeNull();
    });

    it('removes invalid cached payloads', async () => {
      const key = cacheKey('ws-invalid');
      window.sessionStorage.setItem(key, JSON.stringify({ nope: true }));

      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-invalid' }));
      await flushAsync();

      expect(result.current.hasCachedLogs).toBe(false);
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('persists added logs to sessionStorage', async () => {
      const key = cacheKey('ws-persist');
      const { result } = renderHook(() => useLogCache({ sessionId: 'ws-persist' }));
      await flushAsync();

      act(() => {
        result.current.addLogEntry('info', 'stored in session');
      });

      await waitFor(() => {
        const raw = window.sessionStorage.getItem(key);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!) as { logs: LogEntry[] };
        expect(parsed.logs[0].message).toBe('stored in session');
      });
    });
  });
});
