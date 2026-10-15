/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMcpVerificationsStore } from './mcpVerifications';

const storeGet = vi.fn();
const storeSet = vi.fn();

const probeResult = {
  ok: true as const,
  serverName: 'stateset-sync',
  serverVersion: '2.1.0',
  protocolVersion: '2025-06-18',
  toolCount: 3,
  tools: ['a', 'b', 'c'],
};

const otherBrandEntry = {
  serverName: 'other',
  serverVersion: '1.0.0',
  toolCount: 1,
  tools: [],
  verifiedAt: '2026-09-20T12:00:00.000Z',
};

function setElectronApi(api: unknown) {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  storeGet.mockResolvedValue({});
  storeSet.mockResolvedValue(true);
  setElectronApi({ store: { get: storeGet, set: storeSet } });
  useMcpVerificationsStore.setState({ entries: {}, isLoaded: false });
});

afterEach(() => {
  setElectronApi(undefined);
});

describe('useMcpVerificationsStore', () => {
  describe('load', () => {
    it('reads the persisted map once and marks itself loaded', async () => {
      storeGet.mockResolvedValue({ 'brand-1:sync': otherBrandEntry });

      await useMcpVerificationsStore.getState().load();
      await useMcpVerificationsStore.getState().load();

      expect(useMcpVerificationsStore.getState().entries['brand-1:sync']).toEqual(otherBrandEntry);
      expect(useMcpVerificationsStore.getState().isLoaded).toBe(true);
      expect(storeGet).toHaveBeenCalledTimes(1);
    });

    it('dedupes concurrent loads from several consumers', async () => {
      storeGet.mockResolvedValue({});

      await Promise.all([
        useMcpVerificationsStore.getState().load(),
        useMcpVerificationsStore.getState().load(),
        useMcpVerificationsStore.getState().load(),
      ]);

      expect(storeGet).toHaveBeenCalledTimes(1);
    });

    it('stays unloaded when the read fails, so the next write retries it', async () => {
      storeGet.mockRejectedValueOnce(new Error('store unavailable'));

      await useMcpVerificationsStore.getState().load();
      expect(useMcpVerificationsStore.getState().isLoaded).toBe(false);

      storeGet.mockResolvedValue({ 'brand-1:sync': otherBrandEntry });
      await useMcpVerificationsStore.getState().record('brand-1', 'stateset-sync', probeResult);

      // The retry picked up what was on disk before writing.
      expect(useMcpVerificationsStore.getState().entries['brand-1:sync']).toEqual(otherBrandEntry);
    });

    it('keeps entries recorded while the read was in flight', async () => {
      storeGet.mockResolvedValue({ 'brand-1:sync': otherBrandEntry });
      useMcpVerificationsStore.setState({
        entries: { 'brand-1:sync': { ...otherBrandEntry, serverName: 'recorded-since' } },
      });

      await useMcpVerificationsStore.getState().load();

      expect(useMcpVerificationsStore.getState().entries['brand-1:sync'].serverName).toBe(
        'recorded-since'
      );
    });
  });

  describe('record', () => {
    it('waits for the stored map before writing, so nothing is clobbered', async () => {
      storeGet.mockResolvedValue({ 'brand-2:shopify': otherBrandEntry });

      await useMcpVerificationsStore.getState().record('brand-1', 'stateset-sync', probeResult);

      expect(storeSet).toHaveBeenCalledWith(
        'mcpVerifications',
        expect.objectContaining({
          'brand-2:shopify': otherBrandEntry,
          'brand-1:stateset-sync': expect.objectContaining({ toolCount: 3 }),
        })
      );
    });

    it('keeps the verification in memory when persisting fails', async () => {
      storeSet.mockRejectedValue(new Error('disk full'));

      await useMcpVerificationsStore.getState().record('brand-1', 'stateset-sync', probeResult);

      // The user just saw a successful handshake; the UI should still reflect it.
      expect(useMcpVerificationsStore.getState().entries['brand-1:stateset-sync']).toMatchObject({
        toolCount: 3,
      });
    });

    it('records even with no electron store at all', async () => {
      setElectronApi(undefined);

      await useMcpVerificationsStore.getState().record('brand-1', 'stateset-sync', probeResult);

      expect(useMcpVerificationsStore.getState().entries['brand-1:stateset-sync']).toBeDefined();
    });
  });

  describe('forget', () => {
    it('drops one entry and persists the rest', async () => {
      storeGet.mockResolvedValue({
        'brand-1:stateset-sync': otherBrandEntry,
        'brand-2:shopify': otherBrandEntry,
      });

      await useMcpVerificationsStore.getState().forget('brand-1', 'stateset-sync');

      const persisted = storeSet.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(persisted['brand-1:stateset-sync']).toBeUndefined();
      expect(persisted['brand-2:shopify']).toBeDefined();
      expect(useMcpVerificationsStore.getState().entries['brand-1:stateset-sync']).toBeUndefined();
    });

    it('drops the entry in memory even when persisting fails', async () => {
      storeGet.mockResolvedValue({ 'brand-1:stateset-sync': otherBrandEntry });
      storeSet.mockRejectedValue(new Error('disk full'));

      await useMcpVerificationsStore.getState().forget('brand-1', 'stateset-sync');

      expect(useMcpVerificationsStore.getState().entries['brand-1:stateset-sync']).toBeUndefined();
    });

    it('stays deleted when a slow read lands afterwards', async () => {
      let resolveGet: (value: unknown) => void = () => {};
      storeGet.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveGet = resolve;
        })
      );

      // A consumer's load is still in flight when the user disconnects a server.
      const loading = useMcpVerificationsStore.getState().load();
      const forgetting = useMcpVerificationsStore.getState().forget('brand-1', 'sync');
      resolveGet({ 'brand-1:sync': otherBrandEntry });
      await Promise.all([loading, forgetting]);

      // The delete ran against the loaded map, so the read cannot undo it.
      expect(useMcpVerificationsStore.getState().entries['brand-1:sync']).toBeUndefined();
    });
  });

  it('never overwrites the stored map when the read failed', async () => {
    storeGet.mockRejectedValue(new Error('store unavailable'));

    await useMcpVerificationsStore.getState().record('brand-1', 'stateset-sync', probeResult);

    // Writing here would replace every other brand's entry with just this one.
    expect(storeSet).not.toHaveBeenCalled();
    // The session still reflects the handshake the user just watched succeed.
    expect(useMcpVerificationsStore.getState().entries['brand-1:stateset-sync']).toBeDefined();
  });

  it('does not delete from disk either when the read failed', async () => {
    storeGet.mockRejectedValue(new Error('store unavailable'));

    await useMcpVerificationsStore.getState().forget('brand-1', 'stateset-sync');

    expect(storeSet).not.toHaveBeenCalled();
  });

  describe('clear', () => {
    it('drops everything in memory and on disk', async () => {
      const storeDelete = vi.fn().mockResolvedValue(true);
      setElectronApi({ store: { get: storeGet, set: storeSet, delete: storeDelete } });
      storeGet.mockResolvedValue({ 'brand-1:sync': otherBrandEntry });
      await useMcpVerificationsStore.getState().load();

      await useMcpVerificationsStore.getState().clear();

      expect(useMcpVerificationsStore.getState().entries).toEqual({});
      expect(storeDelete).toHaveBeenCalledWith('mcpVerifications');
    });

    it('re-reads from disk for the next account', async () => {
      const storeDelete = vi.fn().mockResolvedValue(true);
      setElectronApi({ store: { get: storeGet, set: storeSet, delete: storeDelete } });
      storeGet.mockResolvedValue({});
      await useMcpVerificationsStore.getState().load();
      await useMcpVerificationsStore.getState().clear();

      // isLoaded was reset, so the next consumer loads again rather than
      // trusting the previous account's empty map.
      expect(useMcpVerificationsStore.getState().isLoaded).toBe(false);
      await useMcpVerificationsStore.getState().load();
      expect(storeGet).toHaveBeenCalledTimes(2);
    });
  });
});
