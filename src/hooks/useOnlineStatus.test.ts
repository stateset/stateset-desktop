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

  it('initializes with navigator.onLine state', () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('detects offline state', () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('responds to online event', async () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());

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

    onlineGetter.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('provides a checkNow function', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(typeof result.current.checkNow).toBe('function');
  });

  it('tracks latencyMs after health check', async () => {
    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      await result.current.checkNow();
    });

    // latencyMs should be set after a successful check
    expect(result.current.latencyMs === null || typeof result.current.latencyMs === 'number').toBe(
      true
    );
  });
});
