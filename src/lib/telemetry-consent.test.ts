/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({ log: { child: () => ({ debug: vi.fn() }) } }));
let collector: ReturnType<(typeof import('./telemetry'))['initializeTelemetry']> | undefined;
const fetchMock = vi.fn();
const ok = { ok: true, status: 200 } as Response;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function tick() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok);
  vi.stubGlobal('fetch', fetchMock);
  window.sessionStorage.clear();
  window.localStorage.clear();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
});
afterEach(async () => {
  await collector?.cleanup();
  collector = undefined;
  vi.unstubAllGlobals();
});

describe('telemetry consent revocation', () => {
  it('stops immediately and drops queued events instead of sending a final opt-out batch', async () => {
    const mod = await import('./telemetry');
    collector = mod.initializeTelemetry({
      enabled: true,
      endpoint: 'https://owned.test/events',
      batchSize: 50,
    });
    const stopped = collector.disable();
    try {
      expect(collector.isEnabled()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      mod.track('feature.used', { feature: 'after-opt-out' });
    } finally {
      await stopped;
    }
    await collector.cleanup();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an active request and never replays its rejected batch after a fresh opt-in', async () => {
    const request = deferred<Response>();
    fetchMock.mockImplementationOnce(() => request.promise);
    const mod = await import('./telemetry');
    collector = mod.initializeTelemetry({
      enabled: true,
      endpoint: 'https://owned.test/events',
      batchSize: 1,
    });
    await tick();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    try {
      await collector.disable();
      expect(signal.aborted).toBe(true);
    } finally {
      request.reject(new Error('Owned aborted request'));
      await tick();
    }
    collector.enable();
    await tick();
    await collector.cleanup();
    const laterEvents = fetchMock.mock.calls
      .slice(1)
      .flatMap((call) => JSON.parse(call[1].body).events);
    expect(laterEvents.some((event: { event: string }) => event.event === 'app.started')).toBe(
      false
    );
  });

  it('ignores an opt-in read that completes after the user has opted out', async () => {
    const read = deferred<unknown>();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        store: {
          get: vi.fn((key: string) =>
            key === 'telemetryEnabled' ? read.promise : Promise.resolve('owned-user')
          ),
          set: vi.fn().mockResolvedValue(true),
        },
      },
    });
    const mod = await import('./telemetry');
    collector = mod.initializeTelemetry();
    await collector.disable();
    read.resolve(true);
    await tick();
    expect(collector.isEnabled()).toBe(false);
  });

  it('stops local collection before a failing native opt-out save settles', async () => {
    const write = deferred<boolean>();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        store: {
          get: vi.fn().mockResolvedValue('owned-user'),
          set: vi.fn((key: string) =>
            key === 'telemetryEnabled' ? write.promise : Promise.resolve(true)
          ),
        },
      },
    });
    const mod = await import('./telemetry');
    collector = mod.initializeTelemetry({ enabled: true });
    const { usePreferencesStore } = await import('../stores/preferences');
    usePreferencesStore.setState({ initialized: true, telemetryEnabled: true });
    const save = usePreferencesStore
      .getState()
      .setTelemetryEnabled(false)
      .catch(() => {});
    try {
      expect(collector.isEnabled()).toBe(false);
      expect(usePreferencesStore.getState().telemetryEnabled).toBe(false);
    } finally {
      write.reject(new Error('Owned preference write failure'));
      await save;
    }
    expect(collector.isEnabled()).toBe(false);
    expect(usePreferencesStore.getState().telemetryEnabled).toBe(false);
  });
});
