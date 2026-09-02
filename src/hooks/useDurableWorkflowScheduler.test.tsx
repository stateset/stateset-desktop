/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '../test-utils';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { usePreferencesStore } from '../stores/preferences';
import { useDurableWorkflowScheduler } from './useDurableWorkflowScheduler';

const startMock = vi.fn();

vi.mock('../lib/durableWorkflows', () => ({
  durableWorkflowApi: { start: (...args: unknown[]) => startMock(...args) },
}));

describe('useDurableWorkflowScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7' });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        store: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
      },
    });
    usePreferencesStore.setState({ desktopNotifications: false });
    const now = new Date().toISOString();
    useDurableWorkflowsStore.setState({
      initialized: true,
      apiKey: 'durable-key',
      workflows: [],
      schedules: [
        {
          id: 'schedule-due',
          name: 'Due inventory review',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
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
    startMock.mockResolvedValue({ workflow_id: 'workflow-scheduled', run_id: 'run-scheduled' });
  });

  it('claims and launches a due schedule exactly once', async () => {
    renderHook(() => useDurableWorkflowScheduler());

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().workflows[0]?.workflowId).toBe(
        'workflow-scheduled'
      )
    );
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      enabled: false,
      lastWorkflowId: 'workflow-scheduled',
    });
  });

  it('waits for the previous scheduled workflow before launching the next run', async () => {
    useDurableWorkflowsStore.setState((state) => ({
      workflows: [
        {
          workflowId: 'workflow-previous',
          runId: 'run-previous',
          requestId: 'request-previous',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Previous work',
          status: 'running',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      schedules: state.schedules.map((schedule) => ({
        ...schedule,
        frequency: 'daily' as const,
        lastWorkflowId: 'workflow-previous',
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
  });
});
