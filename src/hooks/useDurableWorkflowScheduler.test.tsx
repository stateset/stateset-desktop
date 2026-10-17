/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { act, renderHook, waitFor } from '../test-utils';
import {
  useDurableWorkflowsStore,
  type PendingScheduledOccurrence,
} from '../stores/durableWorkflows';
import { usePreferencesStore } from '../stores/preferences';
import { useDurableWorkflowScheduler } from './useDurableWorkflowScheduler';

const startMock = vi.fn();
const statusMock = vi.fn();
const brandId = '8e3a730e-0868-40cd-8c32-9c82fe60e26d';
const requestId = '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7';
const workflowId = `active-horizon-agent-${brandId.replace(/-/g, '')}-${requestId.replace(/-/g, '')}`;
const engineUrl = 'https://engine.example.com';
vi.mock('../lib/durableWorkflows', () => ({
  durableWorkflowApi: {
    start: (...args: unknown[]) => startMock(...args),
    status: (...args: unknown[]) => statusMock(...args),
  },
}));
function deferred() {
  let resolve!: (value?: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = (value = true) => done(value);
  });
  return { promise, resolve };
}
function pendingOccurrence(submitted = true): PendingScheduledOccurrence {
  const schedule = useDurableWorkflowsStore.getState().schedules[0];
  return {
    requestId,
    workflowId,
    engineUrl,
    tenantId: schedule.tenantId,
    brandId,
    goal: schedule.goal,
    definition: schedule.definition,
    dueAt: schedule.nextRunAt,
    claimedAt: new Date().toISOString(),
    submitted,
  };
}
function seedPending(submitted = true, enabled = true) {
  const pending = pendingOccurrence(submitted);
  useDurableWorkflowsStore.setState((state) => ({
    schedules: state.schedules.map((schedule) => ({
      ...schedule,
      enabled,
      pendingOccurrence: pending,
    })),
  }));
  return pending;
}
const confirmation = (status = 'completed') => ({
  goal: 'Review inventory',
  status,
  current_task_id: null,
  generation: 1,
  turns_completed: 1,
  failures: 0,
  elapsed_active_secs: 2,
  active_window_secs: 3600,
  max_turns: 10,
  tasks_remaining: 0,
  paused: false,
  cancelled: status === 'cancelled',
  steering_notes: [],
});

describe('useDurableWorkflowScheduler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => requestId });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { store: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) } },
    });
    usePreferencesStore.setState({ desktopNotifications: false });
    const now = new Date().toISOString();
    useDurableWorkflowsStore.setState({
      initialized: true,
      configuring: false,
      engineUrl,
      apiKey: 'durable-key',
      connectionRevision: null,
      workflows: [],
      schedules: [
        {
          id: 'schedule-due',
          name: 'Due inventory review',
          tenantId: 'tenant-1',
          brandId,
          goal: 'Review inventory',
          definition: {
            steps: [['python3 /workspace/review.py']],
            activeWindowSeconds: 3600,
            maxFailures: 3,
            perCommandTimeoutSeconds: 300,
            stepAgents: [null],
          },
          frequency: 'once',
          nextRunAt: new Date(Date.now() - 1_000).toISOString(),
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    startMock.mockResolvedValue({ workflow_id: workflowId, run_id: 'run-scheduled' });
    statusMock.mockResolvedValue(confirmation());
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('persists the request and dispatch marker before POST, and advances only after tracking', async () => {
    const originalDue = useDurableWorkflowsStore.getState().schedules[0].nextRunAt;
    startMock.mockImplementation(async () => {
      expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
        enabled: true,
        nextRunAt: originalDue,
        pendingOccurrence: { requestId, submitted: true },
      });
      expect(window.electronAPI!.store.set).toHaveBeenCalledWith(
        'durableWorkflowSchedules',
        expect.arrayContaining([
          expect.objectContaining({
            pendingOccurrence: expect.objectContaining({ requestId, submitted: true }),
          }),
        ])
      );
      return { workflow_id: workflowId, run_id: null };
    });
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].lastWorkflowId).toBe(workflowId)
    );
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({ enabled: false });
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined();
    expect(useDurableWorkflowsStore.getState().workflows[0].runId).toBe('');
  });

  it('does not claim or launch while the connection is being changed', async () => {
    useDurableWorkflowsStore.setState({ configuring: true });
    renderHook(() => useDurableWorkflowScheduler());
    await act(async () => Promise.resolve());
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('does not launch with an invalidated native connection revision', async () => {
    Object.assign(window.electronAPI!, { computerChat: { getConnection: vi.fn() } });
    renderHook(() => useDurableWorkflowScheduler());
    await act(async () => Promise.resolve());
    expect(startMock).not.toHaveBeenCalled();
    expect(window.electronAPI!.store.set).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it.each([1, 2])(
    'does not dispatch if the connection changes during persistence step %s',
    async (step) => {
      const gate = deferred();
      let scheduleWrites = 0;
      vi.mocked(window.electronAPI!.store.set).mockImplementation(async (key) => {
        if (key === 'durableWorkflowSchedules' && ++scheduleWrites === step) await gate.promise;
        return true;
      });
      renderHook(() => useDurableWorkflowScheduler());
      await waitFor(() => expect(scheduleWrites).toBe(step));
      act(() => {
        useDurableWorkflowsStore.setState({ engineUrl: 'https://other-engine.example.com' });
      });
      await act(async () => {
        gate.resolve();
        await gate.promise;
      });
      await waitFor(() => expect(scheduleWrites).toBeGreaterThanOrEqual(step));
      expect(startMock).not.toHaveBeenCalled();
      expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({ enabled: true });
      await waitFor(() =>
        expect(
          useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.submitted
        ).not.toBe(true)
      );
    }
  );

  it('detects connection A to B to A while a claim is saving', async () => {
    const gate = deferred();
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(() => gate.promise);
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() => expect(window.electronAPI!.store.set).toHaveBeenCalledTimes(1));
    await act(async () => {
      await useDurableWorkflowsStore
        .getState()
        .setConfiguration('https://other-engine.example.com');
      await useDurableWorkflowsStore.getState().setConfiguration(engineUrl);
      gate.resolve();
      await gate.promise;
    });
    expect(startMock).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it.each([1, 2])(
    'honors a pause enqueued during persistence step %s before dispatch',
    async (step) => {
      const gate = deferred();
      let writes = 0;
      vi.mocked(window.electronAPI!.store.set).mockImplementation(async (key) => {
        if (key === 'durableWorkflowSchedules' && ++writes === step) await gate.promise;
        return true;
      });
      renderHook(() => useDurableWorkflowScheduler());
      await waitFor(() => expect(writes).toBe(step));
      const schedule = useDurableWorkflowsStore.getState().schedules[0];
      await act(async () => {
        const pause = useDurableWorkflowsStore
          .getState()
          .saveSchedule({ ...schedule, enabled: false });
        gate.resolve();
        await pause;
      });
      await waitFor(() =>
        expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
      );
      expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(false);
      expect(startMock).not.toHaveBeenCalled();
    }
  );

  it('never POSTs when storage rejects the claim', async () => {
    vi.mocked(window.electronAPI!.store.set).mockResolvedValue(false);
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() => expect(window.electronAPI!.store.set).toHaveBeenCalled());
    await act(async () => Promise.resolve());
    expect(startMock).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it('retains uncertain identity after a lost response and recovers read-only after remount', async () => {
    startMock.mockRejectedValue(new Error('Response lost'));
    const first = renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].lastError).toContain(
        'Launch could not be confirmed'
      )
    );
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      enabled: true,
      pendingOccurrence: { requestId, submitted: true, needsAttention: true },
    });
    first.unmount();
    await act(async () => {
      await useDurableWorkflowsStore.getState().updateSchedule('schedule-due', (current) => ({
        ...current,
        pendingOccurrence: { ...current.pendingOccurrence!, needsAttention: false },
      }));
    });
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
    );
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(statusMock).toHaveBeenCalledWith('tenant-1', workflowId);
    expect(useDurableWorkflowsStore.getState().workflows[0].status).toBe('completed');
  });

  it.each(['completed', 'failed', 'cancelled', 'dependency_deadlock', 'executing_parallel'])(
    'confirms a persisted %s run even while its schedule is paused',
    async (status) => {
      seedPending(true, false);
      statusMock.mockResolvedValue(confirmation(status));
      renderHook(() => useDurableWorkflowScheduler());
      await waitFor(() =>
        expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
      );
      expect(startMock).not.toHaveBeenCalled();
      expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(false);
      expect(useDurableWorkflowsStore.getState().workflows[0].status).toBe(status);
    }
  );

  it.each([
    {},
    { ...confirmation(), status: 'unexpected' },
    { ...confirmation(), failures: -1 },
    { ...confirmation(), goal: 'Other run' },
  ])('keeps a malformed confirmation pending: %j', async (body) => {
    seedPending();
    statusMock.mockResolvedValue(body);
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(
        useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
      ).toBe(true)
    );
    expect(startMock).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
    expect(useDurableWorkflowsStore.getState().workflows).toEqual([]);
  });

  it.each([404, 409])(
    'does not treat HTTP %s as permission to create another run',
    async (status) => {
      seedPending();
      statusMock.mockRejectedValue(Object.assign(new Error('Run not confirmed'), { status }));
      renderHook(() => useDurableWorkflowScheduler());
      await waitFor(() =>
        expect(
          useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
        ).toBe(true)
      );
      expect(startMock).not.toHaveBeenCalled();
      expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.requestId).toBe(
        requestId
      );
    }
  );

  it('uses the frozen occurrence input and preserves edits made while its response is pending', async () => {
    const gate = deferred();
    startMock.mockImplementation(async () => {
      await gate.promise;
      return { workflow_id: workflowId, run_id: 'run' };
    });
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    const newDue = new Date(Date.now() + 86_400_000).toISOString();
    await act(async () => {
      const current = useDurableWorkflowsStore.getState().schedules[0];
      await useDurableWorkflowsStore.getState().saveSchedule({
        ...current,
        name: 'Edited schedule',
        goal: 'New goal',
        enabled: false,
        nextRunAt: newDue,
      });
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
    );
    expect(startMock.mock.calls[0][0]).toMatchObject({ goal: 'Review inventory', requestId });
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      name: 'Edited schedule',
      goal: 'New goal',
      nextRunAt: newDue,
      enabled: false,
    });
  });

  it('leaves a durable pending identity when tracking cannot be saved', async () => {
    vi.mocked(window.electronAPI!.store.set).mockImplementation(
      async (key) => key !== 'durableTrackedWorkflows'
    );
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(
        useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
      ).toBe(true)
    );
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it('keeps a mismatched start receipt unconfirmed without tracking another identity', async () => {
    startMock.mockResolvedValue({ workflow_id: 'other-workflow', run_id: 'other-run' });
    renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() =>
      expect(
        useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
      ).toBe(true)
    );
    expect(useDurableWorkflowsStore.getState().workflows).toEqual([]);
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.workflowId).toBe(
      workflowId
    );
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it('shares a dispatch lock across concurrent hook instances', async () => {
    renderHook(() => {
      useDurableWorkflowScheduler();
      useDurableWorkflowScheduler();
    });
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
    );
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
  });

  it('releases a hung launch for read-only recovery without another POST', async () => {
    vi.useFakeTimers();
    startMock.mockReturnValue(new Promise(() => undefined));
    renderHook(() => useDurableWorkflowScheduler());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toMatchObject({
      submitted: true,
      needsAttention: true,
    });
    await act(async () => {
      await useDurableWorkflowsStore.getState().updateSchedule('schedule-due', (current) => ({
        ...current,
        pendingOccurrence: { ...current.pendingOccurrence!, needsAttention: false },
      }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined();
  });

  it('does not launch a known-unsent claim after unmount', async () => {
    const gate = deferred();
    vi.mocked(window.electronAPI!.store.set).mockImplementationOnce(() => gate.promise);
    const view = renderHook(() => useDurableWorkflowScheduler());
    await waitFor(() => expect(window.electronAPI!.store.set).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(startMock).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
  });

  it('waits for a previous run before launching a new occurrence', async () => {
    useDurableWorkflowsStore.setState((state) => ({
      workflows: [
        {
          workflowId: 'previous',
          runId: 'run',
          requestId: 'previous',
          tenantId: 'tenant-1',
          brandId,
          goal: 'Previous',
          status: 'running',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      schedules: state.schedules.map((schedule) => ({
        ...schedule,
        frequency: 'daily',
        lastWorkflowId: 'previous',
      })),
    }));
    renderHook(() => useDurableWorkflowScheduler());
    await act(async () => Promise.resolve());
    expect(startMock).not.toHaveBeenCalled();
    act(() => {
      useDurableWorkflowsStore.setState((state) => ({
        workflows: state.workflows.map((workflow) => ({ ...workflow, status: 'completed' })),
      }));
    });
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toBeUndefined()
    );
  });
});
