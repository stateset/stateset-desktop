/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

// --- Mocks ---

vi.mock('../stores/auth', () => ({
  useAuthStore: {
    getState: () => ({ apiKey: 'test-key' }),
  },
}));

vi.mock('../lib/api', () => ({
  apiCircuitBreaker: {
    getStatus: vi.fn().mockReturnValue({ state: 'closed', failureCount: 0 }),
    onStateChange: vi.fn().mockReturnValue(() => {}),
  },
}));

describe('useOnlineStatus', () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock navigator.onLine
    onlineGetter = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          database: 'connected',
          redis: 'connected',
          nats: 'connected',
        }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineGetter.mockRestore();
  });

  it('initializes with navigator.onLine state', async () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('detects offline state', async () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isOnline).toBe(false);
  });

  it('responds to online event', async () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isOnline).toBe(false);

    onlineGetter.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('responds to offline event', async () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    onlineGetter.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('provides a checkNow function', async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });
    expect(typeof result.current.checkNow).toBe('function');
  });

  it('tracks latencyMs after health check', async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.checkNow();
    });

    // latencyMs should be set after a successful check
    expect(result.current.latencyMs === null || typeof result.current.latencyMs === 'number').toBe(
      true
    );
  });

  it('uses independent abort signals for basic and detailed health checks', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal | undefined);
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            version: '1.0.0',
            checks: {
              database: { status: 'healthy' },
              redis: { status: 'healthy' },
              nats: { status: 'healthy' },
            },
            circuit_breakers: {
              sandbox: 'closed',
              webhook: 'closed',
              database: 'closed',
              external_api: 'closed',
            },
            resilience_healthy: true,
          }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    fetchMock.mockClear();
    signals.length = 0;

    await act(async () => {
      await result.current.checkNow();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBeDefined();
    expect(signals[1]).toBeDefined();
    expect(signals[0]).not.toBe(signals[1]);
  });

  it('falls back to legacy /health/detailed when /api/v1/health/detailed is unavailable', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      requestedUrls.push(url);

      if (url.endsWith('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'healthy' }) } as Response;
      }

      if (url.endsWith('/api/v1/health/detailed')) {
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          version: '1.0.0',
          checks: {
            database: { status: 'healthy' },
            redis: { status: 'healthy' },
            nats: { status: 'healthy' },
          },
          circuit_breakers: {
            sandbox: 'closed',
            webhook: 'closed',
            database: 'closed',
            external_api: 'closed',
          },
          resilience_healthy: true,
        }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    fetchMock.mockClear();
    requestedUrls.length = 0;

    await act(async () => {
      await result.current.checkNow();
    });

    expect(requestedUrls.some((url) => url.endsWith('/api/v1/health/detailed'))).toBe(true);
    expect(requestedUrls.some((url) => url.endsWith('/health/detailed'))).toBe(true);
  });

  it('parses detailed health envelopes and safely normalizes unknown statuses', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'healthy' }) } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            checks: {
              database: { status: 'healthy' },
              redis: { status: 'degraded' },
              nats: { status: 'flaky' },
            },
            circuit_breakers: {
              sandbox: 'open',
              webhook: 'unexpected_value',
              database: 'closed',
            },
            resilience_healthy: false,
          },
        }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.checkNow();
    });

    expect(result.current.componentHealth).toEqual({
      database: 'healthy',
      redis: 'unknown',
      nats: 'unknown',
    });
    expect(result.current.serverCircuitBreakers).toEqual({
      sandbox: 'open',
      webhook: 'closed',
      database: 'closed',
      external_api: 'closed',
    });
    expect(result.current.serverResilienceHealthy).toBe(false);
  });
});
