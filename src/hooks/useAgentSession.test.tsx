/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgentSession, useAgentConfigEditor } from './useAgentSession';
import { agentApi } from '../lib/api';
import { DEFAULT_AGENT_CONFIG } from '../lib/agentConfig';
import type { AgentSession, AgentSessionConfig, AgentSessionStatus } from '../types';

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

const mockPrefsState = { refreshInterval: 0 };

vi.mock('../stores/preferences', () => ({
  usePreferencesStore: (selector: (s: typeof mockPrefsState) => unknown) =>
    selector(mockPrefsState),
}));

vi.mock('../lib/api', () => ({
  agentApi: {
    getSession: vi.fn(),
    startSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    stopSession: vi.fn(),
    sendMessage: vi.fn(),
    updateConfig: vi.fn(),
    createSession: vi.fn(),
  },
}));

function makeSession(
  status: AgentSessionStatus,
  overrides: Partial<AgentSession> = {}
): AgentSession {
  return {
    id: 'session-1',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'commerce',
    status,
    config: { ...DEFAULT_AGENT_CONFIG },
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
    ...overrides,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState.tenant = mockTenant;
  mockAuthState.currentBrand = mockBrand;
  vi.mocked(agentApi.getSession).mockResolvedValue(makeSession('running'));
});

describe('useAgentSession', () => {
  it('fetches the session and derives status flags', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1' }), { wrapper });

    await waitFor(() => {
      expect(result.current.session).toBeDefined();
    });

    expect(agentApi.getSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1');
    expect(result.current.isRunning).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isStopped).toBe(false);
  });

  it.each([
    ['paused', 'isPaused'],
    ['stopped', 'isStopped'],
    ['failed', 'isStopped'],
    ['starting', 'isStatusStarting'],
    ['stopping', 'isStatusStopping'],
  ] as const)('maps status %s to %s', async (status, flag) => {
    vi.mocked(agentApi.getSession).mockResolvedValue(makeSession(status));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1' }), { wrapper });

    await waitFor(() => {
      expect(result.current.session).toBeDefined();
    });

    expect(result.current[flag]).toBe(true);
  });

  it('does not fetch when no tenant is selected', async () => {
    mockAuthState.tenant = null;
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1' }), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(agentApi.getSession).not.toHaveBeenCalled();
    expect(result.current.session).toBeUndefined();
  });

  it('reports query errors through onError', async () => {
    vi.mocked(agentApi.getSession).mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { wrapper } = createWrapper();
    renderHook(() => useAgentSession({ sessionId: 'session-1', onError }), { wrapper });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Failed to load session', 'boom');
    });
  });

  it('deduplicates repeated identical query errors', async () => {
    vi.mocked(agentApi.getSession).mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1', onError }), {
      wrapper,
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('starts the session, invalidates the detail query, and notifies success', async () => {
    vi.mocked(agentApi.startSession).mockResolvedValue(makeSession('running'));
    const onSuccess = vi.fn();
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1', onSuccess }), {
      wrapper,
    });

    await act(async () => {
      await result.current.startSessionAsync();
    });

    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1');
    expect(onSuccess).toHaveBeenCalledWith('Session Started', 'Agent session has been started.');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['session', 'tenant-1', 'brand-1', 'session-1'],
    });
  });

  it('notifies onError when a mutation fails', async () => {
    vi.mocked(agentApi.stopSession).mockRejectedValue(new Error('cannot stop'));
    const onError = vi.fn();
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1', onError }), {
      wrapper,
    });

    await act(async () => {
      result.current.stopSession();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Failed to stop session', 'cannot stop');
    });
  });

  it('sends a message to the session', async () => {
    vi.mocked(agentApi.sendMessage).mockResolvedValue(undefined);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1' }), { wrapper });

    await act(async () => {
      await result.current.sendMessageAsync('hello agent');
    });

    expect(agentApi.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'session-1',
      'hello agent'
    );
  });

  it('updates the config and notifies success', async () => {
    vi.mocked(agentApi.updateConfig).mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1', onSuccess }), {
      wrapper,
    });

    const config: AgentSessionConfig = { ...DEFAULT_AGENT_CONFIG, max_iterations: 5 };
    await act(async () => {
      await result.current.updateConfigAsync(config);
    });

    expect(agentApi.updateConfig).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1', config);
    expect(onSuccess).toHaveBeenCalledWith('Config Updated', 'Agent settings have been saved.');
  });

  it('clones the agent using the loaded session agent_type', async () => {
    vi.mocked(agentApi.getSession).mockResolvedValue(
      makeSession('running', { agent_type: 'autonomous' })
    );
    vi.mocked(agentApi.createSession).mockResolvedValue(makeSession('starting'));
    const onSuccess = vi.fn();
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1', onSuccess }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.session).toBeDefined();
    });

    await act(async () => {
      await result.current.cloneAgentAsync({ max_iterations: 10 });
    });

    expect(agentApi.createSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'autonomous', {
      max_iterations: 10,
    });
    expect(onSuccess).toHaveBeenCalledWith(
      'Agent Cloned',
      'New agent created with the same configuration.'
    );
  });

  it('exposes pending state while a mutation is in flight', async () => {
    let resolveStart: (value: AgentSession) => void = () => {};
    vi.mocked(agentApi.startSession).mockImplementation(
      () => new Promise<AgentSession>((resolve) => (resolveStart = resolve))
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAgentSession({ sessionId: 'session-1' }), { wrapper });

    act(() => {
      result.current.startSession();
    });

    await waitFor(() => {
      expect(result.current.isStarting).toBe(true);
    });

    await act(async () => {
      resolveStart(makeSession('running'));
    });

    await waitFor(() => {
      expect(result.current.isStarting).toBe(false);
    });
  });
});

describe('useAgentConfigEditor', () => {
  const initialConfig: AgentSessionConfig = { ...DEFAULT_AGENT_CONFIG, max_iterations: 50 };

  it('syncs the draft from the initial config when not editing', () => {
    const { result } = renderHook(() => useAgentConfigEditor(initialConfig));

    expect(result.current.isEditing).toBe(false);
    expect(result.current.configDraft?.max_iterations).toBe(50);
  });

  it('keeps a null draft when there is no initial config', () => {
    const { result } = renderHook(() => useAgentConfigEditor(null));

    expect(result.current.configDraft).toBeNull();
    expect(result.current.getNormalizedConfig()).toBeNull();
  });

  it('opens and closes the editor', () => {
    const { result } = renderHook(() => useAgentConfigEditor(initialConfig));

    act(() => {
      result.current.openEditor();
    });
    expect(result.current.isEditing).toBe(true);

    act(() => {
      result.current.closeEditor();
    });
    expect(result.current.isEditing).toBe(false);
  });

  it('merges updates into the draft and resets back to the initial config', () => {
    const { result } = renderHook(() => useAgentConfigEditor(initialConfig));

    act(() => {
      result.current.openEditor();
    });
    act(() => {
      result.current.updateDraft({ temperature: 0.2, max_iterations: 7 });
    });

    expect(result.current.configDraft?.temperature).toBe(0.2);
    expect(result.current.configDraft?.max_iterations).toBe(7);

    act(() => {
      result.current.resetDraft();
    });
    expect(result.current.configDraft?.max_iterations).toBe(50);
  });

  it('normalizes the draft (clamping out-of-range values)', () => {
    const { result } = renderHook(() => useAgentConfigEditor(initialConfig));

    act(() => {
      result.current.openEditor();
    });
    act(() => {
      result.current.updateDraft({ temperature: 5, loop_interval_ms: 1 });
    });

    const normalized = result.current.getNormalizedConfig();
    expect(normalized?.temperature).toBe(1);
    expect(normalized?.loop_interval_ms).toBe(100);
  });
});
