import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuditLogStore } from './auditLog';

// Minimal mock for window.electronAPI (node environment — no jsdom needed)
function mockElectronStore() {
  const store: Record<string, unknown> = {};
  const api = {
    store: {
      get: vi.fn((key: string) => Promise.resolve(store[key])),
      set: vi.fn((key: string, value: unknown) => {
        store[key] = value;
        return Promise.resolve();
      }),
    },
  };
  (globalThis as unknown as { window: { electronAPI: typeof api } }).window = { electronAPI: api };
  return api;
}

describe('useAuditLogStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAuditLogStore.setState({ entries: [], isLoaded: false });
  });

  it('starts with empty entries and isLoaded false', () => {
    const state = useAuditLogStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.isLoaded).toBe(false);
  });

  it('initializes from electron store', async () => {
    const saved = [
      {
        id: 'audit-1',
        action: 'agent.started' as const,
        description: 'Started session',
        timestamp: 1000,
      },
    ];
    const mocks = mockElectronStore();
    mocks.store.get.mockResolvedValue(saved);

    await useAuditLogStore.getState().initialize();

    const state = useAuditLogStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.entries).toEqual(saved);
  });

  it('is idempotent — second call does nothing', async () => {
    const mocks = mockElectronStore();
    mocks.store.get.mockResolvedValue([]);

    await useAuditLogStore.getState().initialize();
    await useAuditLogStore.getState().initialize();

    expect(mocks.store.get).toHaveBeenCalledTimes(1);
  });

  it('sets isLoaded true even without electron API', async () => {
    // no electronAPI on window
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};

    await useAuditLogStore.getState().initialize();
    expect(useAuditLogStore.getState().isLoaded).toBe(true);
  });

  it('log() adds an entry with generated id and timestamp', () => {
    mockElectronStore();
    useAuditLogStore.getState().log('agent.started', 'Started session');

    const { entries } = useAuditLogStore.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('agent.started');
    expect(entries[0].description).toBe('Started session');
    expect(entries[0].id).toMatch(/^audit-/);
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('log() keeps newest first', () => {
    mockElectronStore();
    useAuditLogStore.getState().log('agent.created', 'first');
    useAuditLogStore.getState().log('agent.stopped', 'second');

    const { entries } = useAuditLogStore.getState();
    expect(entries[0].action).toBe('agent.stopped');
    expect(entries[1].action).toBe('agent.created');
  });

  it('enforces MAX_ENTRIES cap (500)', () => {
    mockElectronStore();
    for (let i = 0; i < 510; i++) {
      useAuditLogStore.getState().log('config.changed', `entry ${i}`);
    }

    expect(useAuditLogStore.getState().entries).toHaveLength(500);
  });

  it('log() persists to electron store', () => {
    const mocks = mockElectronStore();
    mocks.store.set.mockResolvedValue(undefined);

    useAuditLogStore.getState().log('agent.stopped', 'Stopped');

    expect(mocks.store.set).toHaveBeenCalledWith('auditLog', expect.any(Array));
  });

  it('clear() empties entries and persists', async () => {
    const mocks = mockElectronStore();
    mocks.store.set.mockResolvedValue(undefined);

    useAuditLogStore.getState().log('config.changed', 'entry');
    expect(useAuditLogStore.getState().entries).toHaveLength(1);

    await useAuditLogStore.getState().clear();

    expect(useAuditLogStore.getState().entries).toEqual([]);
    expect(mocks.store.set).toHaveBeenCalledWith('auditLog', []);
  });
});
