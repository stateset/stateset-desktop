/** @vitest-environment happy-dom */
import React, { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundAgents } from './useBackgroundAgents';
import { useAuthStore } from '../stores/auth';
import { usePreferencesStore } from '../stores/preferences';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import type { AgentSession, Brand, Tenant } from '../types';

vi.mock('../lib/api', () => ({
  agentApi: { listSessions: vi.fn(), startSession: vi.fn(), stopSession: vi.fn() },
}));
const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Owned',
  slug: 'owned',
  tier: 'pro',
  created_at: 'now',
};
const brand: Brand = {
  id: 'brand-1',
  tenant_id: tenant.id,
  name: 'Owned',
  slug: 'owned',
  support_platform: 'none',
  ecommerce_platform: 'none',
  config: {},
  mcp_servers: [],
  enabled: true,
  created_at: 'now',
};
function session(id = 's1', owner = brand): AgentSession {
  return {
    id,
    tenant_id: owner.tenant_id,
    brand_id: owner.id,
    agent_type: 'commerce',
    status: 'stopped',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 10,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      mcp_servers: [],
      model: 'owned',
      temperature: 0,
    },
    metrics: {
      loop_count: 0,
      tokens_used: 0,
      tool_calls: 0,
      errors: 0,
      messages_sent: 0,
      uptime_seconds: 0,
    },
    created_at: 'now',
    updated_at: 'now',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function settle() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}
let api: {
  store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  background: { updateAgentStatus: ReturnType<typeof vi.fn> };
  notifications: { show: ReturnType<typeof vi.fn> };
};
let clients: QueryClient[];
function mount({ strict = false, seed = true } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  if (seed) client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [session()]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      {strict ? <StrictMode>{children}</StrictMode> : children}
    </QueryClientProvider>
  );
  const hook = renderHook(
    ({ allowed }) =>
      useBackgroundAgents({ autoRestart: allowed, showNotifications: false, syncToTray: false }),
    { wrapper, initialProps: { allowed: true } }
  );
  return { ...hook, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  clients = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('No real network in recovery regression'))
  );
  useAuthStore.setState({
    tenant,
    currentBrand: brand,
    apiKey: 'owned-key',
    isAuthenticated: true,
    isLoading: false,
  });
  usePreferencesStore.setState({
    initialized: true,
    autoStartAgentsOnLaunch: true,
    saves: {},
    refreshInterval: 60000,
  });
  api = {
    store: {
      get: vi.fn(async (key: string) =>
        key === 'runningAgents' ? { 'tenant-1:brand-1': ['s1'] } : undefined
      ),
      set: vi.fn().mockResolvedValue(true),
    },
    background: { updateAgentStatus: vi.fn().mockResolvedValue(true) },
    notifications: { show: vi.fn().mockResolvedValue(true) },
  };
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  vi.mocked(agentApi.listSessions).mockResolvedValue([session()]);
  vi.mocked(agentApi.startSession).mockImplementation(async (_tenant, _brand, id) => ({
    ...session(id),
    status: 'running',
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
});

describe('confirmed automatic agent recovery', () => {
  it('waits for delayed preferences and preserves saved IDs when the stored setting is off', async () => {
    const read = deferred<unknown>();
    api.store.get.mockImplementation((key: string) =>
      key === 'runningAgents' ? Promise.resolve({ 'tenant-1:brand-1': ['s1'] }) : read.promise
    );
    usePreferencesStore.setState({ initialized: false });
    const loading = usePreferencesStore.getState().initialize();
    mount();
    await settle();
    const before = vi.mocked(agentApi.startSession).mock.calls.length;
    const writes = api.store.set.mock.calls.filter((call) => call[0] === 'runningAgents').length;
    read.resolve(false);
    await act(async () => {
      await loading;
    });
    await settle();
    expect(before).toBe(0);
    expect(writes).toBe(0);
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });
  it('does not automatically start agents when loading preferences failed', async () => {
    api.store.get.mockImplementation(async (key: string) => {
      if (key === 'runningAgents') return { 'tenant-1:brand-1': ['s1'] };
      throw new Error('Owned load failure');
    });
    usePreferencesStore.setState({ initialized: false });
    await usePreferencesStore.getState().initialize();
    mount();
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
    expect(api.store.set).not.toHaveBeenCalled();
  });
  it('keeps saved restart IDs until sessions have actually loaded', async () => {
    const list = deferred<AgentSession[]>();
    vi.mocked(agentApi.listSessions).mockReturnValue(list.promise);
    mount({ seed: false });
    await settle();
    const writes = api.store.set.mock.calls.length;
    list.resolve([session()]);
    await settle();
    expect(writes).toBe(0);
    await waitFor(() => expect(agentApi.startSession).toHaveBeenCalledTimes(1));
  });
  it.each(['pending', 'save_failed', 'load_failed'] as const)(
    'holds automatic starts while the preference is %s',
    async (mode) => {
      usePreferencesStore.setState({
        saves: {
          autoStartAgentsOnLaunch: {
            pending: mode === 'pending',
            requested: false,
            error: mode === 'pending' ? null : mode,
          },
        },
      });
      mount();
      await settle();
      expect(agentApi.startSession).not.toHaveBeenCalled();
    }
  );
  it('honors the confirmed off preference even if a caller enables recovery', async () => {
    usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
    mount();
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });
  it.each([
    'preference',
    'option',
    'brand',
    'tenant',
    'logout',
    'credential',
    'unmount',
    'away-and-back',
  ] as const)('discards a stored read after %s changes', async (change) => {
    const read = deferred<unknown>();
    api.store.get.mockResolvedValue({}).mockReturnValueOnce(read.promise);
    const view = mount();
    await settle();
    act(() => {
      if (change === 'preference') usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
      if (change === 'option') view.rerender({ allowed: false });
      if (change === 'brand') useAuthStore.setState({ currentBrand: { ...brand, id: 'brand-2' } });
      if (change === 'tenant')
        useAuthStore.setState({
          tenant: { ...tenant, id: 'tenant-2' },
          currentBrand: { ...brand, id: 'brand-2', tenant_id: 'tenant-2' },
        });
      if (change === 'logout')
        useAuthStore.setState({
          isAuthenticated: false,
          apiKey: null,
          tenant: null,
          currentBrand: null,
        });
      if (change === 'credential') useAuthStore.setState({ apiKey: 'replacement-owned-key' });
      if (change === 'unmount') view.unmount();
      if (change === 'away-and-back') {
        useAuthStore.setState({ currentBrand: { ...brand, id: 'brand-2' } });
        useAuthStore.setState({ currentBrand: brand });
      }
    });
    read.resolve({ 'tenant-1:brand-1': ['s1'] });
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });
  it('does not send a second start after an opt-out during the first request', async () => {
    const first = deferred<AgentSession>();
    api.store.get.mockResolvedValue({ 'tenant-1:brand-1': ['s1', 's2'] });
    vi.mocked(agentApi.startSession).mockReturnValue(first.promise);
    const view = mount();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        session(),
        session('s2'),
      ])
    );
    await waitFor(() => expect(agentApi.startSession).toHaveBeenCalledTimes(1));
    act(() => usePreferencesStore.setState({ autoStartAgentsOnLaunch: false }));
    first.resolve({ ...session(), status: 'running' });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });
  it('starts each owned saved agent once through Strict Mode and query refreshes', async () => {
    const read = deferred<unknown>();
    api.store.get.mockReturnValue(read.promise);
    const view = mount({ strict: true });
    await settle();
    act(() => view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [session()]));
    read.resolve({ 'tenant-1:brand-1': ['s1', 's1'] });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });
  it('never starts a saved ID that belongs to another workspace in the response', async () => {
    const view = mount();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        session('s1', { ...brand, id: 'brand-foreign' }),
      ])
    );
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });
  it('retains acknowledged running IDs and other workspaces after recovery', async () => {
    let stored: Record<string, string[]> = {
      'tenant-1:brand-1': ['s1'],
      'tenant-other:brand-other': ['other'],
    };
    api.store.get.mockImplementation(async () => structuredClone(stored));
    api.store.set.mockImplementation(async (_key: string, value: Record<string, string[]>) => {
      stored = structuredClone(value);
      return true;
    });
    mount();
    await waitFor(() => expect(agentApi.startSession).toHaveBeenCalledTimes(1));
    await settle();
    expect(stored).toEqual({ 'tenant-1:brand-1': ['s1'], 'tenant-other:brand-other': ['other'] });
  });
});

describe('restart snapshot and acknowledgement boundaries', () => {
  it('preserves saved IDs while an enabled startup preference is loading', async () => {
    const read = deferred<unknown>();
    let stored = { 'tenant-1:brand-1': ['s1'] };
    api.store.get.mockImplementation((key: string) =>
      key === 'runningAgents' ? Promise.resolve(structuredClone(stored)) : read.promise
    );
    api.store.set.mockImplementation(async (_key: string, value: typeof stored) => {
      stored = structuredClone(value);
      return true;
    });
    usePreferencesStore.setState({ initialized: false });
    const loading = usePreferencesStore.getState().initialize();
    mount();
    await settle();
    const before = vi.mocked(agentApi.startSession).mock.calls.length;
    const beforeIds = structuredClone(stored);
    read.resolve(true);
    await act(async () => {
      await loading;
    });
    await settle();
    expect(before).toBe(0);
    expect(beforeIds).toEqual({ 'tenant-1:brand-1': ['s1'] });
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
    expect(stored).toEqual({ 'tenant-1:brand-1': ['s1'] });
  });
  it('discards a delayed snapshot write after unmount', async () => {
    const read = deferred<unknown>();
    usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
    api.store.get.mockReturnValue(read.promise);
    const view = mount();
    await settle();
    expect(api.store.get).toHaveBeenCalledWith('runningAgents');
    view.unmount();
    read.resolve({ 'tenant-1:brand-1': ['s1'] });
    await settle();
    expect(api.store.set).not.toHaveBeenCalled();
  });
  it('preserves the old workspace when its pending write is superseded by a brand switch', async () => {
    const read = deferred<unknown>();
    const other = { ...brand, id: 'brand-2' };
    const stored = { 'tenant-1:brand-1': ['s1'], 'tenant-other:brand-other': ['other'] };
    usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
    api.store.get.mockResolvedValue(stored).mockReturnValueOnce(read.promise);
    vi.mocked(agentApi.listSessions).mockResolvedValue([session('s2', other)]);
    const view = mount();
    await settle();
    act(() => {
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, other.id), [
        session('s2', other),
      ]);
      useAuthStore.setState({ currentBrand: other });
    });
    await settle();
    read.resolve(stored);
    await settle();
    expect(api.store.set).toHaveBeenCalled();
    for (const [, value] of api.store.set.mock.calls)
      expect(value['tenant-1:brand-1']).toEqual(['s1']);
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });
  it('lets the newly selected workspace recover without waiting for an obsolete read', async () => {
    const old = deferred<unknown>();
    const other = { ...brand, id: 'brand-2' };
    api.store.get
      .mockResolvedValue({ 'tenant-1:brand-2': ['s2'] })
      .mockReturnValueOnce(old.promise);
    vi.mocked(agentApi.startSession).mockImplementation(async (t, b, id) => ({
      ...session(id, { ...brand, id: b, tenant_id: t }),
      status: 'running',
    }));
    const view = mount();
    await settle();
    act(() => {
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, other.id), [
        session('s2', other),
      ]);
      useAuthStore.setState({ currentBrand: other });
    });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledExactlyOnceWith(tenant.id, other.id, 's2');
    old.resolve({ 'tenant-1:brand-1': ['s1'] });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });
  it('can retry a failed saved-ID read after a fresh session snapshot without starting prematurely', async () => {
    api.store.get.mockRejectedValueOnce(new Error('Owned temporary read failure'));
    const view = mount();
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
    expect(api.store.set).not.toHaveBeenCalled();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        { ...session(), updated_at: 'fresh' },
      ])
    );
    await settle();
    await waitFor(() => expect(agentApi.startSession).toHaveBeenCalledTimes(1));
  });
  it('does not duplicate a pending start when a query refresh finishes', async () => {
    const request = deferred<AgentSession>();
    vi.mocked(agentApi.startSession).mockReturnValue(request.promise);
    const view = mount();
    await settle();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        { ...session(), updated_at: 'fresh' },
      ])
    );
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
    request.resolve({ ...session(), status: 'running' });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });
  it('does not replay an uncertain submitted start after refresh or preference changes', async () => {
    vi.mocked(agentApi.startSession).mockRejectedValueOnce(new Error('Owned lost acknowledgement'));
    const view = mount();
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
    act(() => {
      usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
      usePreferencesStore.setState({ autoStartAgentsOnLaunch: true });
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        { ...session(), updated_at: 'fresh' },
      ]);
    });
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });
  it('does not continue a batch or record a response owned by another workspace', async () => {
    api.store.get.mockResolvedValue({ 'tenant-1:brand-1': ['s1', 's2'] });
    vi.mocked(agentApi.startSession).mockResolvedValue({
      ...session('s1', { ...brand, id: 'foreign' }),
      status: 'running',
    });
    const view = mount();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        session(),
        session('s2'),
      ])
    );
    await settle();
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
    expect(api.store.set).not.toHaveBeenCalled();
    expect(
      view.client
        .getQueryData<AgentSession[]>(queryKeys.sessions.list(tenant.id, brand.id))
        ?.every((s) => s.brand_id === brand.id)
    ).toBe(true);
  });
  it.each(['signed-out', 'authenticating'] as const)(
    'waits when authentication is %s despite cached owner IDs',
    async (state) => {
      useAuthStore.setState({
        isAuthenticated: state !== 'signed-out',
        isLoading: state === 'authenticating',
      });
      mount();
      await settle();
      expect(agentApi.startSession).not.toHaveBeenCalled();
      expect(api.store.set).not.toHaveBeenCalled();
    }
  );
  it('keeps the stored map when the session snapshot contains a foreign record', async () => {
    const view = mount();
    act(() =>
      view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
        session('s1', { ...brand, id: 'foreign' }),
      ])
    );
    await settle();
    expect(agentApi.startSession).not.toHaveBeenCalled();
    expect(api.store.set).not.toHaveBeenCalled();
  });
});

it('recovers owned agents from a tenant-wide list without starting or erasing another brand', async () => {
  const other = { ...brand, id: 'brand-2' };
  let stored = { 'tenant-1:brand-1': ['s1'], 'tenant-1:brand-2': ['s2'] };
  api.store.get.mockImplementation(async () => structuredClone(stored));
  api.store.set.mockImplementation(async (_key: string, value: typeof stored) => {
    stored = structuredClone(value);
    return true;
  });
  const view = mount();
  act(() =>
    view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
      session(),
      session('s2', other),
    ])
  );
  await waitFor(() =>
    expect(agentApi.startSession).toHaveBeenCalledExactlyOnceWith(tenant.id, brand.id, 's1')
  );
  await settle();
  await waitFor(() => expect(api.store.set).toHaveBeenCalled());
  expect(stored).toEqual({ 'tenant-1:brand-1': ['s1'], 'tenant-1:brand-2': ['s2'] });
});

it('keeps background counts and bulk controls scoped to the selected brand', async () => {
  usePreferencesStore.setState({ autoStartAgentsOnLaunch: false });
  const view = mount();
  act(() =>
    view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
      { ...session(), updated_at: 'refreshed' },
      { ...session('s2', { ...brand, id: 'brand-2' }), status: 'running' },
    ])
  );
  await waitFor(() => expect(view.result.current.sessions[0]?.updated_at).toBe('refreshed'));
  expect(view.result.current.totalCount).toBe(1);
  expect(view.result.current.runningCount).toBe(0);
  await act(async () => {
    await view.result.current.startAllStopped();
    await view.result.current.stopAllRunning();
  });
  expect(agentApi.startSession).toHaveBeenCalledExactlyOnceWith(tenant.id, brand.id, 's1');
  expect(agentApi.stopSession).not.toHaveBeenCalled();
});

it('retries an undispatched restore when a temporary session-query error clears', async () => {
  const read = deferred<unknown>();
  api.store.get.mockResolvedValue({ 'tenant-1:brand-1': ['s1'] }).mockReturnValueOnce(read.promise);
  const view = mount();
  await settle();
  vi.mocked(agentApi.listSessions).mockRejectedValueOnce(
    new Error('Owned temporary query failure')
  );
  await act(async () => {
    await view.client.refetchQueries({ queryKey: queryKeys.sessions.list(tenant.id, brand.id) });
  });
  read.resolve({ 'tenant-1:brand-1': ['s1'] });
  await settle();
  expect(agentApi.startSession).not.toHaveBeenCalled();
  act(() =>
    view.client.setQueryData(queryKeys.sessions.list(tenant.id, brand.id), [
      { ...session(), updated_at: 'query-recovered' },
    ])
  );
  await waitFor(() => expect(agentApi.startSession).toHaveBeenCalledTimes(1));
});
