/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor, screen } from '@testing-library/react';
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
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

function renderActions(sessions: AgentSession[], selectedIds = new Set<string>()) {
  const clearSelection = vi.fn();
  const { Wrapper, queryClient } = createWrapper();
  const hook = renderHook(
    ({ sessions, selectedIds }) => useSessionActions({ sessions, selectedIds, clearSelection }),
    {
      initialProps: { sessions, selectedIds },
      wrapper: Wrapper,
    }
  );
  return { ...hook, clearSelection, queryClient };
}

let scopeSequence = 0;

describe('useSessionActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentApi.startSession).mockReset().mockResolvedValue(makeSession());
    vi.mocked(agentApi.stopSession).mockReset().mockResolvedValue(undefined);
    vi.mocked(agentApi.deleteSession).mockReset().mockResolvedValue(undefined);
    useAuthStore.setState({
      tenant,
      currentBrand: brand,
      apiKey: `sk-actions-test-${++scopeSequence}`,
    });
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

  it.each(['start', 'stop'] as const)(
    'reports partial bulk %s failures and audits only successful requests',
    async (action) => {
      const status = action === 'start' ? 'stopped' : 'running';
      const sessions = [makeSession({ id: 'ok', status }), makeSession({ id: 'fail', status })];
      if (action === 'start') {
        vi.mocked(agentApi.startSession)
          .mockResolvedValueOnce(sessions[0])
          .mockRejectedValueOnce(new Error('Unavailable'));
      } else {
        vi.mocked(agentApi.stopSession)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Unavailable'));
      }
      const { result } = renderActions(sessions, new Set(['ok', 'fail']));
      await act(async () => {
        await (action === 'start'
          ? result.current.handleBulkStart()
          : result.current.handleBulkStop());
      });
      expect(screen.getByText('Bulk action incomplete')).toBeInTheDocument();
      expect(
        screen.getByText(`1 ${action === 'start' ? 'started' : 'stopped'}; 1 failed to ${action}.`)
      ).toBeInTheDocument();
      const entries = useAuditLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].metadata?.sessionId).toBe('ok');
      expect(result.current.isBulkActing).toBe(false);
    }
  );

  it('reports an entirely failed bulk request without a success message', async () => {
    vi.mocked(agentApi.stopSession).mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderActions(
      [makeSession({ id: 'fail', status: 'running' })],
      new Set(['fail'])
    );
    await act(async () => {
      await result.current.handleBulkStop();
    });
    expect(screen.getByText('0 stopped; 1 failed to stop.')).toBeInTheDocument();
    expect(useAuditLogStore.getState().entries).toHaveLength(0);
  });

  it('prevents duplicate and competing submissions until the in-flight bulk action completes', async () => {
    let finish!: () => void;
    vi.mocked(agentApi.stopSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderActions(
      [
        makeSession({ id: 'running', status: 'running' }),
        makeSession({ id: 'stopped', status: 'stopped' }),
      ],
      new Set(['running', 'stopped'])
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleBulkStop();
      void result.current.handleBulkStop();
      void result.current.handleBulkStart();
    });
    expect(result.current.isBulkActing).toBe(true);
    expect(agentApi.stopSession).toHaveBeenCalledTimes(1);
    expect(agentApi.startSession).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isBulkActing).toBe(false);
  });

  it.each(['start', 'stop', 'delete'] as const)(
    'continues fleet %s after an early failure and refreshes the original list once',
    async (action) => {
      const status = action === 'stop' ? 'running' : 'stopped';
      const sessions = ['failed', 'second', 'third'].map((id) => makeSession({ id, status }));
      const operation = {
        start: agentApi.startSession,
        stop: agentApi.stopSession,
        delete: agentApi.deleteSession,
      }[action];
      vi.mocked(operation).mockRejectedValueOnce(new Error('Unavailable'));
      const { result, queryClient } = renderActions(sessions);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      if (action === 'delete') act(() => result.current.setShowDeleteConfirm(true));
      await act(async () => {
        await {
          start: result.current.handleStartAll,
          stop: result.current.handleStopAll,
          delete: result.current.handleDeleteStopped,
        }[action]();
      });
      expect(operation).toHaveBeenCalledTimes(3);
      expect(result.current.batchResult).toMatchObject({
        total: 3,
        succeeded: 2,
        failed: [sessions[0]],
        skipped: 0,
      });
      expect(screen.getByText('Fleet action incomplete')).toBeInTheDocument();
      expect(useAuditLogStore.getState().entries.map((entry) => entry.metadata?.sessionId)).toEqual(
        ['third', 'second']
      );
      expect(useAuditLogStore.getState().entries[0].metadata).toMatchObject({
        tenantId: 'tenant-1',
        brandId: 'brand-1',
      });
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['sessions', 'tenant-1', 'brand-1'],
        exact: true,
        refetchType: 'active',
      });
    }
  );

  it('shows incremental progress and blocks fleet, selection and row actions synchronously', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    vi.mocked(agentApi.stopSession)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSecond = resolve;
          })
      );
    const sessions = [
      makeSession({ id: 'first' }),
      makeSession({ id: 'second' }),
      makeSession({ id: 'stopped', status: 'stopped' }),
    ];
    const { result } = renderActions(sessions, new Set(['first', 'stopped']));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleStopAll();
      void result.current.handleStopAll();
      void result.current.handleStartAll();
      void result.current.handleBulkStart();
      void result.current.handleBulkStop();
      void result.current.handleStartSession('stopped');
      result.current.setShowDeleteConfirm(true);
    });
    expect(result.current.isActionBusy).toBe(true);
    expect(result.current.batchProgress).toEqual({ action: 'stop', completed: 0, total: 2 });
    expect(agentApi.stopSession).toHaveBeenCalledTimes(1);
    expect(agentApi.startSession).not.toHaveBeenCalled();
    expect(result.current.showDeleteConfirm).toBe(false);
    await act(async () => finishFirst());
    await waitFor(() => expect(result.current.batchProgress?.completed).toBe(1));
    expect(agentApi.stopSession).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishSecond();
      await pending;
    });
    expect(result.current.isActionBusy).toBe(false);
    expect(result.current.batchProgress).toBeNull();
  });

  it('retries only failed targets and never replays a successful request', async () => {
    const sessions = [
      makeSession({ id: 'failed', status: 'stopped' }),
      makeSession({ id: 'ok', status: 'stopped' }),
    ];
    vi.mocked(agentApi.startSession).mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderActions(sessions);
    await act(async () => result.current.handleStartAll());
    await act(async () => result.current.retryFailed());
    expect(vi.mocked(agentApi.startSession).mock.calls.map((args) => args[2])).toEqual([
      'failed',
      'ok',
      'failed',
    ]);
    expect(result.current.batchResult).toMatchObject({ total: 1, succeeded: 1, failed: [] });
    act(() => result.current.dismissBatchResult());
    expect(result.current.batchResult).toBeNull();
  });

  it('pins cleanup to reviewed targets and skips agents that become active before confirmation', async () => {
    const sessions = [
      makeSession({ id: 'now-active', status: 'stopped' }),
      makeSession({ id: 'reviewed', status: 'failed' }),
    ];
    const { result, rerender } = renderActions(sessions);
    act(() => result.current.setShowDeleteConfirm(true));
    rerender({
      sessions: [
        { ...sessions[0], status: 'running' },
        sessions[1],
        makeSession({ id: 'new', status: 'stopped' }),
      ],
      selectedIds: new Set<string>(),
    });
    expect(result.current.deleteCount).toBe(2);
    await act(async () => result.current.handleDeleteStopped());
    expect(agentApi.deleteSession).toHaveBeenCalledTimes(1);
    expect(agentApi.deleteSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'reviewed');
    expect(result.current.batchResult).toMatchObject({ total: 2, succeeded: 1, skipped: 1 });
  });

  it('requires a reviewed confirmation before deletion or retrying failed cleanup', async () => {
    const sessions = [
      makeSession({ id: 'failed', status: 'stopped' }),
      makeSession({ id: 'ok', status: 'stopped' }),
    ];
    const { result } = renderActions(sessions);
    await act(async () => result.current.handleDeleteStopped());
    expect(agentApi.deleteSession).not.toHaveBeenCalled();
    vi.mocked(agentApi.deleteSession).mockRejectedValueOnce(new Error('Unavailable'));
    act(() => result.current.setShowDeleteConfirm(true));
    await act(async () => result.current.handleDeleteStopped());
    expect(result.current.showDeleteConfirm).toBe(false);
    await act(async () => result.current.retryFailed());
    expect(agentApi.deleteSession).toHaveBeenCalledTimes(2);
    expect(result.current.showDeleteConfirm).toBe(true);
    expect(result.current.deleteCount).toBe(1);
    await act(async () => result.current.handleDeleteStopped());
    expect(vi.mocked(agentApi.deleteSession).mock.calls.map((args) => args[2])).toEqual([
      'failed',
      'ok',
      'failed',
    ]);
  });

  it.each(['brand', 'tenant', 'credentials'] as const)(
    'stops pending requests when %s changes and hides the old result',
    async (change) => {
      let finish!: () => void;
      vi.mocked(agentApi.stopSession).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      const { result, queryClient, clearSelection } = renderActions([
        makeSession({ id: 'first' }),
        makeSession({ id: 'second' }),
      ]);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.handleStopAll();
      });
      act(() =>
        useAuthStore.setState(
          change === 'brand'
            ? { currentBrand: { ...brand, id: 'other' } }
            : change === 'tenant'
              ? { tenant: { ...tenant, id: 'other' } }
              : { apiKey: 'sk-other-identity' }
        )
      );
      await act(async () => {
        finish();
        await pending;
      });
      expect(agentApi.stopSession).toHaveBeenCalledTimes(1);
      expect(result.current.batchResult).toBeNull();
      expect(clearSelection).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['sessions', 'tenant-1', 'brand-1'],
        exact: true,
        refetchType: 'none',
      });
      expect(result.current.isActionBusy).toBe(false);
    }
  );

  it('does not issue requests without a workspace and releases the action controls', async () => {
    useAuthStore.setState({ currentBrand: null });
    const { result } = renderActions([makeSession({ status: 'stopped' })]);
    await act(async () => result.current.handleStartAll());
    expect(agentApi.startSession).not.toHaveBeenCalled();
    expect(screen.getByText('Unable to update agents')).toBeInTheDocument();
    expect(result.current.isActionBusy).toBe(false);
  });

  it('blocks a fleet action until an individual row request finishes', async () => {
    let finish!: () => void;
    vi.mocked(agentApi.stopSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderActions([
      makeSession({ id: 'running' }),
      makeSession({ id: 'stopped', status: 'stopped' }),
    ]);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleStopSession('running');
      void result.current.handleStartAll();
      void result.current.handleStopSession('running');
    });
    await waitFor(() => expect(agentApi.stopSession).toHaveBeenCalledTimes(1));
    expect(agentApi.startSession).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isActionBusy).toBe(false);
  });

  it('keeps completed requests out of retries if local audit recording fails', async () => {
    const log = vi.spyOn(useAuditLogStore.getState(), 'log').mockImplementationOnce(() => {
      throw new Error('Local audit unavailable');
    });
    const { result } = renderActions([
      makeSession({ status: 'stopped' }),
      makeSession({ status: 'stopped' }),
    ]);
    await act(async () => result.current.handleStartAll());
    expect(result.current.batchResult).toMatchObject({ succeeded: 2, failed: [] });
    await act(async () => result.current.retryFailed());
    expect(agentApi.startSession).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('discards pending cleanup confirmation when changing workspaces', async () => {
    const { result } = renderActions([makeSession({ status: 'stopped' })]);
    act(() => result.current.setShowDeleteConfirm(true));
    expect(result.current.showDeleteConfirm).toBe(true);
    act(() => useAuthStore.setState({ currentBrand: { ...brand, id: 'other-workspace' } }));
    expect(result.current.showDeleteConfirm).toBe(false);
    await act(async () => result.current.handleDeleteStopped());
    expect(agentApi.deleteSession).not.toHaveBeenCalled();
  });

  it('explains when failed cleanup targets are no longer eligible instead of silently ignoring retry', async () => {
    const session = makeSession({ id: 'changed', status: 'stopped' });
    vi.mocked(agentApi.deleteSession).mockRejectedValueOnce(new Error('Unavailable'));
    const { result, rerender } = renderActions([session]);
    act(() => result.current.setShowDeleteConfirm(true));
    await act(async () => result.current.handleDeleteStopped());
    rerender({ sessions: [{ ...session, status: 'running' }], selectedIds: new Set<string>() });
    await act(async () => result.current.retryFailed());
    expect(agentApi.deleteSession).toHaveBeenCalledTimes(1);
    expect(result.current.showDeleteConfirm).toBe(false);
    expect(result.current.batchResult).toMatchObject({ succeeded: 0, skipped: 1, failed: [] });
    expect(screen.getByText('No agents to delete')).toBeInTheDocument();
  });

  it('retains the action lock, progress, and result when the dashboard is remounted', async () => {
    let finish!: () => void;
    vi.mocked(agentApi.stopSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const sessions = [
      makeSession({ id: 'running' }),
      makeSession({ id: 'stopped', status: 'stopped' }),
    ];
    const original = renderActions(sessions);
    let pending!: Promise<void>;
    act(() => {
      pending = original.result.current.handleStopAll();
    });
    original.unmount();
    const next = renderActions(sessions);
    expect(next.result.current.isActionBusy).toBe(true);
    expect(next.result.current.batchProgress).toMatchObject({
      action: 'stop',
      total: 1,
      completed: 0,
    });
    await act(async () => next.result.current.handleStartAll());
    expect(agentApi.startSession).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await pending;
    });
    expect(next.result.current.isActionBusy).toBe(false);
    expect(next.result.current.batchResult).toMatchObject({ succeeded: 1, failed: [] });
  });

  it('uses optimistic mutations for individual row actions', async () => {
    const { result } = renderActions([makeSession({ id: 'sess-1', status: 'stopped' })]);

    act(() => {
      void result.current.handleStartSession('sess-1');
    });
    await waitFor(() => {
      expect(agentApi.startSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'sess-1');
    });
  });
});
