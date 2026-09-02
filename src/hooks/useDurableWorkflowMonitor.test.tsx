/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '../test-utils';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { useNotificationsStore } from '../stores/notifications';
import { usePreferencesStore } from '../stores/preferences';
import { useDurableWorkflowMonitor } from './useDurableWorkflowMonitor';

const statusMock = vi.fn();

vi.mock('../lib/durableWorkflows', () => ({
  durableWorkflowApi: {
    status: (...args: unknown[]) => statusMock(...args),
  },
}));

function runningStatus(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'Review inventory',
    status: 'running',
    current_task_id: null,
    generation: 1,
    turns_completed: 0,
    failures: 0,
    elapsed_active_secs: 5,
    active_window_secs: 3600,
    max_turns: 10,
    tasks_remaining: 2,
    paused: false,
    cancelled: false,
    steering_notes: [],
    ...overrides,
  };
}

function trackedWorkflow(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    workflowId: 'workflow-1',
    runId: 'run-1',
    requestId: 'request-1',
    tenantId: 'tenant-1',
    brandId: 'brand-1',
    goal: 'Review inventory',
    status: 'running',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('useDurableWorkflowMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        store: {
          get: vi.fn(),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    usePreferencesStore.setState({ desktopNotifications: false });
    useNotificationsStore.setState({ notifications: [] });
    useDurableWorkflowsStore.setState({
      initialized: true,
      apiKey: 'durable-key',
      workflows: [],
    });
  });

  it('does not poll before initialization', async () => {
    useDurableWorkflowsStore.setState({
      initialized: false,
      workflows: [trackedWorkflow()],
    });

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(statusMock).not.toHaveBeenCalled();
    unmount();
  });

  it('does not poll without an API key', async () => {
    useDurableWorkflowsStore.setState({ apiKey: null, workflows: [trackedWorkflow()] });

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(statusMock).not.toHaveBeenCalled();
    unmount();
  });

  it('polls active workflows and updates status without notifying while running', async () => {
    useDurableWorkflowsStore.setState({ workflows: [trackedWorkflow()] });
    statusMock.mockResolvedValue(runningStatus());

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());

    await waitFor(() => expect(statusMock).toHaveBeenCalledWith('tenant-1', 'workflow-1'));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().workflows[0]?.details?.status).toBe('running')
    );
    expect(useNotificationsStore.getState().notifications).toHaveLength(0);
    unmount();
  });

  it('notifies success when a workflow completes', async () => {
    useDurableWorkflowsStore.setState({ workflows: [trackedWorkflow()] });
    statusMock.mockResolvedValue(runningStatus({ status: 'completed' }));

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());

    await waitFor(() => expect(useNotificationsStore.getState().notifications).toHaveLength(1));
    expect(useNotificationsStore.getState().notifications[0]).toMatchObject({
      type: 'success',
      title: 'Background workflow completed',
    });
    unmount();
  });

  it('notifies a warning when a workflow stops abnormally', async () => {
    useDurableWorkflowsStore.setState({ workflows: [trackedWorkflow()] });
    statusMock.mockResolvedValue(runningStatus({ status: 'failed' }));

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());

    await waitFor(() => expect(useNotificationsStore.getState().notifications).toHaveLength(1));
    expect(useNotificationsStore.getState().notifications[0]).toMatchObject({
      type: 'warning',
      title: 'Background workflow stopped',
    });
    unmount();
  });

  it('records the error when a status check fails', async () => {
    useDurableWorkflowsStore.setState({ workflows: [trackedWorkflow()] });
    statusMock.mockRejectedValue(new Error('engine unreachable'));

    const { unmount } = renderHook(() => useDurableWorkflowMonitor());

    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().workflows[0]?.lastError).toBe('engine unreachable')
    );
    unmount();
  });
});
