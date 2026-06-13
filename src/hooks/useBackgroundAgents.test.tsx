/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBackgroundAgents } from './useBackgroundAgents';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import type { AgentSession, AgentSessionStatus } from '../types';

// --- Mocks ---

const mockTenant = { id: 'tenant-1', name: 'Test Tenant' };
const mockBrand = { id: 'brand-1', name: 'Test Brand' };

const mockAuthState: { tenant: typeof mockTenant | null; currentBrand: typeof mockBrand | null } = {
  tenant: mockTenant,
  currentBrand: mockBrand,
};

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}));

const mockPrefsState = {
  desktopNotifications: true,
  soundAlerts: false,
  refreshInterval: 0,
};

vi.mock('../stores/preferences', () => ({
  usePreferencesStore: (selector: (s: typeof mockPrefsState) => unknown) =>
    selector(mockPrefsState),
}));

vi.mock('../lib/api', () => ({
  agentApi: {
    listSessions: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
  },
}));

interface MockElectronAPI {
  background: { updateAgentStatus: ReturnType<typeof vi.fn> };
  notifications: { show: ReturnType<typeof vi.fn> };
  store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
}

let electronAPI: MockElectronAPI;

function makeSession(id: string, status: AgentSessionStatus, agentType = 'commerce'): AgentSession {
  return {
    id,
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: agentType,
    status,
    config: {
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: false,
      mcp_servers: [],
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
    },
    metrics: {
      loop_count: 0,
      tokens_used: 0,
      tool_calls: 0,
      errors: 0,
      messages_sent: 0,
      uptime_seconds: 0,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const sessionsListKey = queryKeys.sessions.list('tenant-1', 'brand-1');

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState.tenant = mockTenant;
  mockAuthState.currentBrand = mockBrand;
  mockPrefsState.desktopNotifications = true;

  electronAPI = {
    background: { updateAgentStatus: vi.fn().mockResolvedValue(true) },
    notifications: { show: vi.fn().mockResolvedValue(true) },
    store: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(true),
    },
  };
  Object.defineProperty(window, 'electronAPI', {
    value: electronAPI,
    writable: true,
    configurable: true,
  });

  vi.mocked(agentApi.listSessions).mockResolvedValue([]);
  vi.mocked(agentApi.startSession).mockResolvedValue(makeSession('s1', 'running'));
  vi.mocked(agentApi.stopSession).mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe('useBackgroundAgents', () => {
  it('exposes sessions with running and total counts', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'running'),
      makeSession('s2', 'stopped'),
      makeSession('s3', 'running'),
    ]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });

    await waitFor(() => {
      expect(result.current.totalCount).toBe(3);
    });
    expect(result.current.runningCount).toBe(2);
    expect(result.current.isLoading).toBe(false);
  });

  it('syncs agent counts to the system tray', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'running'),
      makeSession('s2', 'stopped'),
    ]);
    const { wrapper } = createWrapper();

    renderHook(() => useBackgroundAgents(), { wrapper });

    await waitFor(() => {
      expect(electronAPI.background.updateAgentStatus).toHaveBeenCalledWith({
        running: 1,
        total: 2,
      });
    });
  });

  it('does not touch the tray when syncToTray is disabled', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'running')]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents({ syncToTray: false }), { wrapper });

    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });
    expect(electronAPI.background.updateAgentStatus).not.toHaveBeenCalled();
  });

  it('persists running agent ids to the electron store keyed by tenant and brand', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'running'),
      makeSession('s2', 'stopped'),
    ]);
    const { wrapper } = createWrapper();

    renderHook(() => useBackgroundAgents(), { wrapper });

    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('runningAgents', {
        'tenant-1:brand-1': ['s1'],
      });
    });
  });

  it('shows a desktop notification when an agent starts running', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });

    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });
    expect(electronAPI.notifications.show).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(sessionsListKey, [makeSession('s1', 'running')]);
    });

    await waitFor(() => {
      expect(electronAPI.notifications.show).toHaveBeenCalledWith({
        title: 'Agent Started',
        body: 'Commerce agent is now running.',
      });
    });
  });

  it('shows a desktop notification when a running agent fails', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });

    act(() => {
      queryClient.setQueryData(sessionsListKey, [makeSession('s1', 'running')]);
    });
    await waitFor(() => {
      expect(electronAPI.notifications.show).toHaveBeenCalledTimes(1);
    });

    act(() => {
      queryClient.setQueryData(sessionsListKey, [makeSession('s1', 'failed')]);
    });

    await waitFor(() => {
      expect(electronAPI.notifications.show).toHaveBeenCalledWith({
        title: 'Agent Failed',
        body: 'Commerce agent has stopped due to an error.',
      });
    });
  });

  it('suppresses notifications when showNotifications is false', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents({ showNotifications: false }), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });

    act(() => {
      queryClient.setQueryData(sessionsListKey, [makeSession('s1', 'running')]);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(electronAPI.notifications.show).not.toHaveBeenCalled();
  });

  it('suppresses desktop notifications when the preference is disabled', async () => {
    mockPrefsState.desktopNotifications = false;
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });

    act(() => {
      queryClient.setQueryData(sessionsListKey, [makeSession('s1', 'running')]);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(electronAPI.notifications.show).not.toHaveBeenCalled();
  });

  it('auto-restarts previously running agents from the stored map', async () => {
    electronAPI.store.get.mockImplementation(async (key: string) =>
      key === 'runningAgents' ? { 'tenant-1:brand-1': ['s1'] } : undefined
    );
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'stopped'),
      makeSession('s2', 'stopped'),
    ]);
    const { wrapper } = createWrapper();

    renderHook(() => useBackgroundAgents({ autoRestart: true }), { wrapper });

    await waitFor(() => {
      expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's1');
    });
    // Only the previously-running agent is restarted
    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
  });

  it('migrates a legacy array of running agent ids to the per-context map', async () => {
    electronAPI.store.get.mockImplementation(async (key: string) =>
      key === 'runningAgents' ? ['s1'] : undefined
    );
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper } = createWrapper();

    renderHook(() => useBackgroundAgents({ autoRestart: true }), { wrapper });

    await waitFor(() => {
      expect(electronAPI.store.set).toHaveBeenCalledWith('runningAgents', {
        'tenant-1:brand-1': ['s1'],
      });
    });
  });

  it('does not auto-restart when disabled', async () => {
    electronAPI.store.get.mockResolvedValue({ 'tenant-1:brand-1': ['s1'] });
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });

    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });

  it('starts and stops individual sessions through the API', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession('s1', 'stopped')]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });

    await act(async () => {
      await result.current.startSession('s1');
    });
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's1');

    await act(async () => {
      await result.current.stopSession('s1');
    });
    expect(agentApi.stopSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's1');
  });

  it('startAllStopped starts only stopped and failed sessions', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'stopped'),
      makeSession('s2', 'failed'),
      makeSession('s3', 'running'),
    ]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(3);
    });

    await act(async () => {
      await result.current.startAllStopped();
    });

    expect(agentApi.startSession).toHaveBeenCalledTimes(2);
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's1');
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's2');
  });

  it('stopAllRunning stops running and paused sessions', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession('s1', 'running'),
      makeSession('s2', 'paused'),
      makeSession('s3', 'stopped'),
    ]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useBackgroundAgents(), { wrapper });
    await waitFor(() => {
      expect(result.current.totalCount).toBe(3);
    });

    await act(async () => {
      await result.current.stopAllRunning();
    });

    expect(agentApi.stopSession).toHaveBeenCalledTimes(2);
    expect(agentApi.stopSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's1');
    expect(agentApi.stopSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 's2');
  });

  it('does not fetch sessions when no tenant is selected', async () => {
    mockAuthState.tenant = null;
    const { wrapper } = createWrapper();

    renderHook(() => useBackgroundAgents(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });
    expect(agentApi.listSessions).not.toHaveBeenCalled();
  });
});
