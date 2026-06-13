/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../components/ToastProvider';
import { useAuthStore } from '../../../stores/auth';
import { useAuditLogStore } from '../../../stores/auditLog';
import { useSessionActions } from './useSessionActions';
import { makeSession } from '../testing/fixtures';
import { agentApi } from '../../../lib/api';
import type { AgentSession, Tenant, Brand } from '../../../types';

vi.mock('../../../lib/api', () => ({
  agentApi: {
    startSession: vi.fn(async () => ({})),
    stopSession: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    renameSession: vi.fn(async () => ({})),
  },
}));

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Test Tenant',
  slug: 'test-tenant',
  tier: 'pro',
  created_at: '2024-01-01T00:00:00Z',
};

const brand: Brand = {
  id: 'brand-1',
  tenant_id: 'tenant-1',
  slug: 'brand-1',
  name: 'Test Brand',
  support_platform: 'gorgias',
  ecommerce_platform: 'shopify',
  config: {},
  mcp_servers: [],
  enabled: true,
  created_at: '2024-01-01T00:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderActions(sessions: AgentSession[], selectedIds = new Set<string>()) {
  const clearSelection = vi.fn();
  const hook = renderHook(() => useSessionActions({ sessions, selectedIds, clearSelection }), {
    wrapper: createWrapper(),
  });
  return { ...hook, clearSelection };
}

describe('useSessionActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ tenant, currentBrand: brand });
    useAuditLogStore.setState({ entries: [], isLoaded: true });
  });

  it('starts all stopped/failed sessions and writes audit entries', async () => {
    const sessions = [
      makeSession({ id: 'run-1', status: 'running' }),
      makeSession({ id: 'stop-1', status: 'stopped' }),
      makeSession({ id: 'fail-1', status: 'failed' }),
    ];
    const { result } = renderActions(sessions);

    await act(async () => {
      await result.current.handleStartAll();
    });

    expect(agentApi.startSession).toHaveBeenCalledTimes(2);
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'stop-1');
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'fail-1');

    const entries = useAuditLogStore.getState().entries;
    expect(entries.filter((e) => e.action === 'agent.started')).toHaveLength(2);
  });

  it('does nothing on start all when no sessions are stopped', async () => {
    const { result } = renderActions([makeSession({ status: 'running' })]);

    await act(async () => {
      await result.current.handleStartAll();
    });
    expect(agentApi.startSession).not.toHaveBeenCalled();
  });

  it('stops all running/paused sessions and writes audit entries', async () => {
    const sessions = [
      makeSession({ id: 'run-1', status: 'running' }),
      makeSession({ id: 'pause-1', status: 'paused' }),
      makeSession({ id: 'stop-1', status: 'stopped' }),
    ];
    const { result } = renderActions(sessions);

    await act(async () => {
      await result.current.handleStopAll();
    });

    expect(agentApi.stopSession).toHaveBeenCalledTimes(2);
    const entries = useAuditLogStore.getState().entries;
    expect(entries.filter((e) => e.action === 'agent.stopped')).toHaveLength(2);
  });

  it('deletes stopped sessions and closes the confirm dialog', async () => {
    const sessions = [
      makeSession({ id: 'stop-1', status: 'stopped' }),
      makeSession({ id: 'fail-1', status: 'failed' }),
      makeSession({ id: 'run-1', status: 'running' }),
    ];
    const { result } = renderActions(sessions);

    act(() => result.current.setShowDeleteConfirm(true));
    expect(result.current.showDeleteConfirm).toBe(true);

    await act(async () => {
      await result.current.handleDeleteStopped();
    });

    expect(agentApi.deleteSession).toHaveBeenCalledTimes(2);
    expect(result.current.showDeleteConfirm).toBe(false);
    const entries = useAuditLogStore.getState().entries;
    expect(entries.filter((e) => e.action === 'agent.deleted')).toHaveLength(2);
  });

  it('bulk starts only the selected startable sessions and clears selection', async () => {
    const sessions = [
      makeSession({ id: 'stop-1', status: 'stopped' }),
      makeSession({ id: 'stop-2', status: 'stopped' }),
      makeSession({ id: 'run-1', status: 'running' }),
    ];
    const { result, clearSelection } = renderActions(sessions, new Set(['stop-1', 'run-1']));

    await act(async () => {
      await result.current.handleBulkStart();
    });

    expect(agentApi.startSession).toHaveBeenCalledTimes(1);
    expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'stop-1');
    expect(clearSelection).toHaveBeenCalled();
  });

  it('bulk stops only the selected stoppable sessions', async () => {
    const sessions = [
      makeSession({ id: 'run-1', status: 'running' }),
      makeSession({ id: 'pause-1', status: 'paused' }),
      makeSession({ id: 'stop-1', status: 'stopped' }),
    ];
    const { result, clearSelection } = renderActions(
      sessions,
      new Set(['run-1', 'pause-1', 'stop-1'])
    );

    await act(async () => {
      await result.current.handleBulkStop();
    });

    expect(agentApi.stopSession).toHaveBeenCalledTimes(2);
    expect(clearSelection).toHaveBeenCalled();
  });

  it('renames a session', async () => {
    const { result } = renderActions([makeSession({ id: 'sess-1' })]);

    await act(async () => {
      await result.current.handleRename('sess-1', 'New Name');
    });

    expect(agentApi.renameSession).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'sess-1',
      'New Name'
    );
  });

  it('exposes optimistic start/stop mutations', async () => {
    const { result } = renderActions([makeSession({ id: 'sess-1', status: 'stopped' })]);

    act(() => result.current.startSession.mutate('sess-1'));
    await waitFor(() => {
      expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'sess-1');
    });
  });
});
