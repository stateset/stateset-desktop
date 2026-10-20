/** @vitest-environment happy-dom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/logger', () => ({ log: { child: () => ({ debug: vi.fn() }) } }));
let prefs: (typeof import('./preferences'))['usePreferencesStore'];
let telemetry: typeof import('../lib/telemetry');
let api: {
  store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  background: { setMinimizeToTray: ReturnType<typeof vi.fn> };
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function tick() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network must not be used')));
  api = {
    store: {
      get: vi.fn(async (key: string) => (key === 'telemetryUserId' ? 'owned-user' : undefined)),
      set: vi.fn().mockResolvedValue(true),
    },
    background: { setMinimizeToTray: vi.fn().mockResolvedValue(true) },
  };
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  window.sessionStorage.clear();
  window.localStorage.clear();
  telemetry = await import('../lib/telemetry');
  prefs = (await import('./preferences')).usePreferencesStore;
  prefs.setState({ initialized: true, saves: {} });
});
afterEach(async () => {
  telemetry.applyTelemetryConsent(false);
  await telemetry.getTelemetry()?.cleanup();
  vi.unstubAllGlobals();
});
const fields = [
  ['minimizeToTray', 'setMinimizeToTray', true],
  ['autoStartAgentsOnLaunch', 'setAutoStartAgentsOnLaunch', true],
  ['desktopNotifications', 'setDesktopNotifications', true],
  ['soundAlerts', 'setSoundAlerts', true],
  ['reduceMotion', 'setReduceMotion', false],
  ['compactMode', 'setCompactMode', false],
] as const;
describe('acknowledged preference saves', () => {
  for (const [key, setter, initial] of fields) {
    it.each(['reject', 'false'] as const)(
      `${key} preserves its last confirmed value after %s`,
      async (mode) => {
        const writer = key === 'minimizeToTray' ? api.background.setMinimizeToTray : api.store.set;
        if (mode === 'reject') writer.mockRejectedValueOnce(new Error('Owned persistence failure'));
        else writer.mockResolvedValueOnce(false);
        await prefs.getState()[setter](!initial);
        expect(prefs.getState()[key]).toBe(initial);
        expect(prefs.getState().saves[key]).toEqual({
          pending: false,
          requested: !initial,
          error: 'save_failed',
        });
        await prefs.getState()[setter](!initial);
        expect(prefs.getState()[key]).toBe(!initial);
        expect(prefs.getState().saves[key]?.error).toBeNull();
      }
    );
  }
  it('keeps pending state distinct from the confirmed value and applies only an acknowledged save', async () => {
    const write = deferred<boolean>();
    api.store.set.mockReturnValueOnce(write.promise);
    const saving = prefs.getState().setCompactMode(true);
    await tick();
    expect(prefs.getState().compactMode).toBe(false);
    expect(document.documentElement.dataset.compact).toBe('false');
    expect(prefs.getState().saves.compactMode).toEqual({
      pending: true,
      requested: true,
      error: null,
    });
    write.resolve(true);
    await saving;
    expect(prefs.getState().compactMode).toBe(true);
    expect(document.documentElement.dataset.compact).toBe('true');
  });
  it('serializes repeated writes and restores the actual preceding acknowledgement on a later failure', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    api.store.set.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = prefs.getState().setSoundAlerts(false);
    const b = prefs.getState().setSoundAlerts(true);
    await tick();
    expect(api.store.set).toHaveBeenCalledTimes(1);
    first.resolve(true);
    await a;
    await tick();
    expect(api.store.set).toHaveBeenCalledTimes(2);
    second.reject(new Error('Owned later write failure'));
    await b;
    expect(prefs.getState().soundAlerts).toBe(false);
    expect(prefs.getState().saves.soundAlerts).toEqual({
      pending: false,
      requested: true,
      error: 'save_failed',
    });
  });
  it('allows unrelated preferences to save while another key waits', async () => {
    const held = deferred<boolean>();
    api.store.set.mockImplementation((key: string) =>
      key === 'soundAlerts' ? held.promise : Promise.resolve(true)
    );
    const waiting = prefs.getState().setSoundAlerts(false);
    await prefs.getState().setDesktopNotifications(false);
    expect(prefs.getState().desktopNotifications).toBe(false);
    expect(prefs.getState().saves.soundAlerts?.pending).toBe(true);
    held.resolve(true);
    await waiting;
  });
  it('does not let a stale startup read overwrite a newer acknowledged change', async () => {
    const reads = deferred<unknown>();
    api.store.get.mockReturnValue(reads.promise);
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    await prefs.getState().setSoundAlerts(false);
    reads.resolve(true);
    await loading;
    expect(prefs.getState().soundAlerts).toBe(false);
  });
});
describe('privacy saves fail closed', () => {
  it('starts collection only after an explicit opt-in is acknowledged', async () => {
    const collector = telemetry.initializeTelemetry({ enabled: false });
    const write = deferred<boolean>();
    api.store.set.mockReturnValueOnce(write.promise);
    const saving = prefs.getState().setTelemetryEnabled(true);
    await tick();
    expect(collector.isEnabled()).toBe(false);
    expect(prefs.getState().telemetryEnabled).toBe(false);
    write.resolve(true);
    await saving;
    expect(collector.isEnabled()).toBe(true);
    expect(prefs.getState().telemetryEnabled).toBe(true);
  });
  it.each(['reject', 'false'] as const)(
    'holds collection off when opt-in persistence returns %s',
    async (mode) => {
      const collector = telemetry.initializeTelemetry({ enabled: false });
      if (mode === 'reject') api.store.set.mockRejectedValueOnce(new Error('Owned save failure'));
      else api.store.set.mockResolvedValueOnce(false);
      await prefs.getState().setTelemetryEnabled(true);
      expect(collector.isEnabled()).toBe(false);
      expect(prefs.getState().telemetryEnabled).toBe(false);
      expect(prefs.getState().saves.telemetryEnabled?.error).toBe('session_only');
    }
  );
  it('lets opt-out supersede a pending opt-in without briefly enabling the collector', async () => {
    const collector = telemetry.initializeTelemetry({ enabled: false });
    const enable = vi.spyOn(collector, 'enable');
    const write = deferred<boolean>();
    api.store.set.mockReturnValueOnce(write.promise);
    const on = prefs.getState().setTelemetryEnabled(true);
    await tick();
    const off = prefs.getState().setTelemetryEnabled(false);
    write.resolve(true);
    await on;
    await off;
    expect(enable).not.toHaveBeenCalled();
    expect(collector.isEnabled()).toBe(false);
    expect(
      api.store.set.mock.calls.filter((row) => row[0] === 'telemetryEnabled').map((row) => row[1])
    ).toEqual([true, false]);
  });
  it('keeps opt-out effective when the collector is created after a rejected save', async () => {
    api.store.set.mockRejectedValueOnce(new Error('Owned save failure'));
    await prefs.getState().setTelemetryEnabled(false);
    const collector = telemetry.initializeTelemetry({ enabled: true });
    expect(collector.isEnabled()).toBe(false);
  });
  it('does not overwrite a session opt-out with stale preference hydration', async () => {
    const reads = deferred<unknown>();
    api.store.get.mockReturnValue(reads.promise);
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    await prefs.getState().setTelemetryEnabled(false);
    reads.resolve(true);
    await loading;
    expect(prefs.getState().telemetryEnabled).toBe(false);
    expect(telemetry.initializeTelemetry({ enabled: true }).isEnabled()).toBe(false);
  });
  it('stops collection and exposes an unconfirmed load when preference hydration rejects', async () => {
    const collector = telemetry.initializeTelemetry({ enabled: true });
    api.store.get.mockRejectedValue(new Error('Owned read failure'));
    prefs.setState({ initialized: false });
    await prefs.getState().initialize();
    expect(collector.isEnabled()).toBe(false);
    expect(prefs.getState().telemetryEnabled).toBe(false);
    expect(prefs.getState().saves.soundAlerts?.error).toBe('load_failed');
    expect(prefs.getState().saves.telemetryEnabled?.error).toBe('load_failed');
  });
  it('orders a native opt-out after outstanding collector compatibility writes', async () => {
    const first = deferred<boolean>();
    api.store.set.mockReturnValueOnce(first.promise);
    const collector = telemetry.initializeTelemetry({ enabled: false });
    collector.enable();
    await tick();
    const off = prefs.getState().setTelemetryEnabled(false);
    expect(collector.isEnabled()).toBe(false);
    first.resolve(true);
    await off;
    expect(
      api.store.set.mock.calls.filter((row) => row[0] === 'telemetryEnabled').map((row) => row[1])
    ).toEqual([true, false]);
  });
});

describe('initialization that starts during a preference save', () => {
  it('retains an acknowledged save when an older snapshot completes afterwards', async () => {
    const write = deferred<boolean>();
    const read = deferred<unknown>();
    api.store.set.mockReturnValueOnce(write.promise);
    api.store.get.mockReturnValue(read.promise);
    const saving = prefs.getState().setSoundAlerts(false);
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    await tick();
    write.resolve(true);
    await saving;
    read.resolve(true);
    await loading;
    expect(prefs.getState().soundAlerts).toBe(false);
    expect(prefs.getState().saves.soundAlerts).toEqual({
      pending: false,
      requested: false,
      error: null,
    });
  });

  it('retains an acknowledged opt-in when an older off snapshot completes afterwards', async () => {
    const collector = telemetry.initializeTelemetry({ enabled: false });
    const write = deferred<boolean>();
    const read = deferred<unknown>();
    api.store.set.mockReturnValueOnce(write.promise);
    api.store.get.mockImplementation((key: string) =>
      key === 'telemetryUserId' ? Promise.resolve('owned-user') : read.promise
    );
    const saving = prefs.getState().setTelemetryEnabled(true);
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    await tick();
    write.resolve(true);
    await saving;
    expect(collector.isEnabled()).toBe(true);
    read.resolve(false);
    await loading;
    expect(prefs.getState().telemetryEnabled).toBe(true);
    expect(collector.isEnabled()).toBe(true);
    expect(prefs.getState().saves.telemetryEnabled?.error).toBeNull();
  });

  it('does not replace a completed save with an error from an earlier read', async () => {
    const write = deferred<boolean>();
    const read = deferred<unknown>();
    api.store.set.mockReturnValueOnce(write.promise);
    api.store.get.mockReturnValue(read.promise);
    const saving = prefs.getState().setSoundAlerts(false);
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    await tick();
    write.resolve(true);
    await saving;
    read.reject(new Error('Owned older read failure'));
    await loading;
    expect(prefs.getState().soundAlerts).toBe(false);
    expect(prefs.getState().saves.soundAlerts?.error).toBeNull();
    expect(prefs.getState().saves.compactMode?.error).toBe('load_failed');
  });

  it('allows valid stored values to load after invalid runtime input is ignored', async () => {
    const read = deferred<unknown>();
    api.store.get.mockImplementation((key: string) =>
      read.promise.then(() =>
        key === 'refreshInterval' ? 30000 : key === 'pageSize' ? 50 : undefined
      )
    );
    prefs.setState({ initialized: false });
    const loading = prefs.getState().initialize();
    // @ts-expect-error Deliberately exercise invalid input from an untyped caller.
    await prefs.getState().setRefreshInterval(123);
    // @ts-expect-error Deliberately exercise invalid input from an untyped caller.
    await prefs.getState().setPageSize(123);
    read.resolve(undefined);
    await loading;
    expect(prefs.getState().refreshInterval).toBe(30000);
    expect(prefs.getState().pageSize).toBe(50);
    expect(api.store.set).not.toHaveBeenCalled();
  });
});

describe('restored privacy revocations', () => {
  it('holds collection off after a saved revocation until a fresh explicit opt-in', () => {
    const collector = telemetry.initializeTelemetry({ enabled: false });
    telemetry.applyTelemetryConsent(true);
    expect(collector.isEnabled()).toBe(true);
    expect(telemetry.restoreTelemetryConsent(false)).toBe(false);
    expect(collector.isEnabled()).toBe(false);
    expect(telemetry.restoreTelemetryConsent(true)).toBe(false);
    expect(collector.isEnabled()).toBe(false);
    telemetry.applyTelemetryConsent(true);
    expect(collector.isEnabled()).toBe(true);
  });

  it('preserves a restored revocation before the collector is created', () => {
    telemetry.applyTelemetryConsent(true);
    expect(telemetry.restoreTelemetryConsent(false)).toBe(false);
    expect(telemetry.restoreTelemetryConsent(true)).toBe(false);
    const collector = telemetry.initializeTelemetry({ enabled: true });
    expect(collector.isEnabled()).toBe(false);
    telemetry.applyTelemetryConsent(true);
    expect(collector.isEnabled()).toBe(true);
  });
});
