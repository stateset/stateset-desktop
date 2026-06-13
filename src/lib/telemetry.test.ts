/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Telemetry creates its logger via log.child('Telemetry') at module load.
const telemetryChildLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => telemetryChildLogger),
  },
}));

type TelemetryModule = typeof import('./telemetry');

interface SentEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  userId?: string;
  version?: string;
}

const ENDPOINT = 'https://telemetry.example.test/collect';

let fetchMock: Mock<
  (input?: unknown, init?: RequestInit) => Promise<{ ok: boolean; status: number }>
>;
let currentModule: TelemetryModule | null = null;

async function loadTelemetry(): Promise<TelemetryModule> {
  vi.resetModules();
  currentModule = await import('./telemetry');
  return currentModule;
}

function setElectronAPI(api: unknown): void {
  (window as unknown as { electronAPI?: unknown }).electronAPI = api;
}

function sentEvents(callIndex: number): SentEvent[] {
  const body = String(fetchMock.mock.calls[callIndex]?.[1]?.body);
  return (JSON.parse(body) as { events: SentEvent[] }).events;
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
  setElectronAPI(undefined);
});

afterEach(async () => {
  await currentModule?.getTelemetry()?.cleanup();
  currentModule = null;
  vi.useRealTimers();
});

describe('telemetry opt-in gating', () => {
  it('is disabled by default and drops tracked events', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry();

    expect(instance.isEnabled()).toBe(false);

    mod.track('feature.used', { feature: 'export' });
    await instance.cleanup();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the same singleton from initializeTelemetry and getTelemetry', async () => {
    const mod = await loadTelemetry();
    const first = mod.initializeTelemetry();
    const second = mod.initializeTelemetry({ enabled: true });

    expect(second).toBe(first);
    expect(mod.getTelemetry()).toBe(first);
  });

  it('enable() turns on collection and persists the preference', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ endpoint: ENDPOINT, batchSize: 50 });
    expect(instance.isEnabled()).toBe(false);

    instance.enable();

    expect(instance.isEnabled()).toBe(true);
    await vi.waitFor(() => {
      expect(window.sessionStorage.getItem('telemetryEnabled')).toBe('true');
    });

    await instance.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const events = sentEvents(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'feature.used',
        properties: { feature: 'telemetry.enabled' },
      })
    );
  });

  it('disable() flushes pending events, persists opt-out, and stops collection', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });

    await instance.disable();

    expect(instance.isEnabled()).toBe(false);
    // app.started was queued by initializeTelemetry and flushed by disable()
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentEvents(0).map((e) => e.event)).toContain('app.started');
    await vi.waitFor(() => {
      expect(window.sessionStorage.getItem('telemetryEnabled')).toBe('false');
    });

    mod.track('feature.used', { feature: 'after-disable' });
    await instance.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors a stored opt-in preference from sessionStorage', async () => {
    window.sessionStorage.setItem('telemetryEnabled', 'true');
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry();

    await vi.waitFor(() => {
      expect(instance.isEnabled()).toBe(true);
    });
  });

  it('migrates a legacy localStorage opt-in to sessionStorage', async () => {
    window.localStorage.setItem('telemetryEnabled', 'true');
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry();

    await vi.waitFor(() => {
      expect(instance.isEnabled()).toBe(true);
    });
    expect(window.sessionStorage.getItem('telemetryEnabled')).toBe('true');
    expect(window.localStorage.getItem('telemetryEnabled')).toBeNull();
  });

  it('honors an opt-in preference stored via the electron store', async () => {
    const storeGet = vi.fn(async (key: string) => (key === 'telemetryEnabled' ? true : undefined));
    const storeSet = vi.fn(async () => true);
    setElectronAPI({ store: { get: storeGet, set: storeSet } });

    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry();

    await vi.waitFor(() => {
      expect(instance.isEnabled()).toBe(true);
    });
    expect(storeGet).toHaveBeenCalledWith('telemetryEnabled');
  });
});

describe('telemetry queue and flush behavior', () => {
  it('flushes queued events on the flush interval (fake timers)', async () => {
    vi.useFakeTimers();
    const mod = await loadTelemetry();
    mod.initializeTelemetry({
      enabled: true,
      endpoint: ENDPOINT,
      flushInterval: 5000,
      batchSize: 50,
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(ENDPOINT);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(sentEvents(0).map((e) => e.event)).toContain('app.started');

    // Nothing queued: the next interval should not trigger a request
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    mod.track('feature.used', { feature: 'interval' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentEvents(1)[0]).toMatchObject({
      event: 'feature.used',
      properties: { feature: 'interval' },
    });
  });

  it('flushes immediately once the batch size is reached', async () => {
    const mod = await loadTelemetry();
    // initializeTelemetry queues app.started (1 of 2)
    mod.initializeTelemetry({
      enabled: true,
      endpoint: ENDPOINT,
      batchSize: 2,
      flushInterval: 60_000,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    mod.track('feature.used', { feature: 'batch' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(sentEvents(0)).toHaveLength(2);
  });

  it('re-queues events when the endpoint responds with an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 1 });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();

    // The failed batch is retried on the next flush
    await instance.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentEvents(1).map((e) => e.event)).toContain('app.started');
  });

  it('re-queues events when fetch rejects (network failure)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 1 });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();

    await instance.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentEvents(1).map((e) => e.event)).toContain('app.started');
  });

  it('logs and returns without fetching when no endpoint is configured', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, batchSize: 1 });

    await vi.waitFor(() => {
      expect(telemetryChildLogger.debug).toHaveBeenCalledWith('Events flushed without endpoint', {
        count: 1,
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await instance.cleanup();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('telemetry payloads', () => {
  it('redacts sensitive properties, including nested objects', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });

    mod.track('feature.used', {
      feature: 'export',
      apiKey: 'super-secret',
      userToken: 'tok_123',
      details: { password: 'hunter2', count: 2 },
    });
    await instance.cleanup();

    const event = sentEvents(0).find((e) => e.event === 'feature.used');
    expect(event?.properties).toEqual({
      feature: 'export',
      apiKey: '[REDACTED]',
      userToken: '[REDACTED]',
      details: { password: '[REDACTED]', count: 2 },
    });
  });

  it('attaches session id and timestamp to tracked events', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });

    expect(instance.getSessionId()).toMatch(/^session_\d+_/);

    await instance.cleanup();
    const event = sentEvents(0)[0];
    expect(event.sessionId).toBe(instance.getSessionId());
    expect(typeof event.timestamp).toBe('number');
  });

  it('persists a generated user id and reuses it after a reload', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true });
    const storedUserId = window.sessionStorage.getItem('telemetryUserId');
    expect(storedUserId).toMatch(/^user_\d+_/);
    await instance.cleanup();

    // Simulate an app reload: fresh module, same storage.
    const reloaded = await loadTelemetry();
    const reloadedInstance = reloaded.initializeTelemetry({
      enabled: true,
      endpoint: ENDPOINT,
      batchSize: 1,
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(sentEvents(0)[0].userId).toBe(storedUserId);
    await reloadedInstance.cleanup();
  });

  it('generates and persists a user id via the electron store', async () => {
    const stored = new Map<string, unknown>();
    const storeGet = vi.fn(async (key: string) => stored.get(key));
    const storeSet = vi.fn(async (key: string, value: unknown) => {
      stored.set(key, value);
      return true;
    });
    setElectronAPI({ store: { get: storeGet, set: storeSet } });

    const mod = await loadTelemetry();
    mod.initializeTelemetry({ enabled: true });

    await vi.waitFor(() => {
      expect(storeSet).toHaveBeenCalledWith('telemetryUserId', expect.stringMatching(/^user_/));
    });
  });

  it('reuses an existing user id from the electron store', async () => {
    const storeGet = vi.fn(async (key: string) =>
      key === 'telemetryUserId' ? 'user_existing_42' : undefined
    );
    const storeSet = vi.fn(async () => true);
    setElectronAPI({ store: { get: storeGet, set: storeSet } });

    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });
    await flushMicrotasks();

    mod.track('feature.used', { feature: 'identity' });
    await instance.cleanup();

    const event = sentEvents(0).find((e) => e.event === 'feature.used');
    expect(event?.userId).toBe('user_existing_42');
    expect(storeSet).not.toHaveBeenCalledWith('telemetryUserId', expect.anything());
  });
});

describe('telemetry convenience API', () => {
  it('maps pre-configured trackers to the right events and properties', async () => {
    const mod = await loadTelemetry();
    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });

    mod.telemetry.agentCreated('support', { model: 'm', temperature: 0.2 });
    mod.telemetry.agentStarted('agent-1', 'support');
    mod.telemetry.agentStopped('agent-1', 'user');
    mod.telemetry.agentFailed('agent-1', 'boom');
    mod.telemetry.platformConnected('shopify');
    mod.telemetry.sessionEnded(1234);
    mod.telemetry.featureUsed('export', { format: 'csv' });
    mod.telemetry.errorEncountered('oops', { area: 'settings' });
    mod.telemetry.settingsChanged('theme', 'dark', 'light');

    await instance.cleanup();
    const events = sentEvents(0);
    const byEvent = (name: string) => events.find((e) => e.event === name);

    expect(byEvent('agent.created')?.properties).toEqual({
      agentType: 'support',
      configKeys: 'model,temperature',
    });
    expect(byEvent('agent.started')?.properties).toEqual({
      agentId: 'agent-1',
      agentType: 'support',
    });
    expect(byEvent('agent.stopped')?.properties).toEqual({ agentId: 'agent-1', reason: 'user' });
    expect(byEvent('agent.failed')?.properties).toEqual({ agentId: 'agent-1', error: 'boom' });
    expect(byEvent('platform.connected')?.properties).toEqual({ platform: 'shopify' });
    expect(byEvent('session.ended')?.properties).toEqual({ durationMs: 1234 });
    expect(byEvent('feature.used')?.properties).toEqual({ feature: 'export', format: 'csv' });
    expect(byEvent('error.encountered')?.properties).toEqual({ error: 'oops', area: 'settings' });
    expect(byEvent('settings.changed')?.properties).toEqual({
      setting: 'theme',
      hasOldValue: true,
      newValueType: 'string',
    });
  });

  it('track() is a no-op before initialization', async () => {
    const mod = await loadTelemetry();
    expect(mod.getTelemetry()).toBeNull();
    expect(() => mod.track('feature.used', { feature: 'early' })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('useTelemetry exposes the current state', async () => {
    const mod = await loadTelemetry();

    const before = mod.useTelemetry();
    expect(before.enabled).toBe(false);
    expect(before.sessionId).toBeUndefined();

    const instance = mod.initializeTelemetry({ enabled: true, endpoint: ENDPOINT, batchSize: 50 });
    const after = mod.useTelemetry();
    expect(after.enabled).toBe(true);
    expect(after.sessionId).toBe(instance.getSessionId());

    await after.disable();
    expect(instance.isEnabled()).toBe(false);
    after.enable();
    expect(instance.isEnabled()).toBe(true);
  });
});
