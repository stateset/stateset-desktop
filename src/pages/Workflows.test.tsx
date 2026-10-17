/** @vitest-environment happy-dom */
import { act, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, mockElectronAPI, renderWithProviders, screen, waitFor } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import {
  getScheduleIntentGeneration,
  useDurableWorkflowsStore,
  type DurableWorkflowSchedule,
} from '../stores/durableWorkflows';
import Workflows from './Workflows';

const startMock = vi.fn();
const statusMock = vi.fn();
const signalMock = vi.fn();
const reprioritizeMock = vi.fn();
const terminateMock = vi.fn();
const enqueueMock = vi.fn();

function scheduleFixture(
  overrides: Partial<DurableWorkflowSchedule> = {}
): DurableWorkflowSchedule {
  return {
    id: 'schedule-pending',
    name: 'Inventory schedule',
    tenantId: 'tenant-1',
    brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
    goal: 'Inventory',
    definition: {
      steps: [['python3 /workspace/inventory.py']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
    },
    frequency: 'once',
    nextRunAt: '2026-09-02T02:00:30.000Z',
    enabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function pendingSchedule(
  overrides: Partial<DurableWorkflowSchedule> = {}
): DurableWorkflowSchedule {
  const schedule = scheduleFixture(overrides);
  return {
    ...schedule,
    pendingOccurrence: {
      requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      dueAt: schedule.nextRunAt,
      engineUrl: 'https://api.workstream.stateset.com',
      tenantId: schedule.tenantId,
      brandId: schedule.brandId,
      goal: schedule.goal,
      definition: schedule.definition,
      claimedAt: '2026-09-02T02:00:31.000Z',
      workflowId:
        'active-horizon-agent-29324d3095714f50bbc217b214b74ec7-0aa616a812414b8aa3ae2f79fa72b1e7',
      submitted: true,
      needsAttention: true,
    },
  };
}

vi.mock('../lib/durableWorkflows', () => ({
  assertNoInlineSecrets: vi.fn(),
  durableWorkflowApi: {
    start: (...args: unknown[]) => startMock(...args),
    status: (...args: unknown[]) => statusMock(...args),
    streamEvents: vi.fn(
      (_tenantId: string, _workflowId: string, options: { signal?: AbortSignal }) =>
        new Promise<void>((resolve) =>
          options.signal?.addEventListener('abort', () => resolve(), { once: true })
        )
    ),
    signal: (...args: unknown[]) => signalMock(...args),
    steer: vi.fn(),
    enqueueStep: (...args: unknown[]) => enqueueMock(...args),
    extendBudget: vi.fn(),
    reprioritize: (...args: unknown[]) => reprioritizeMock(...args),
    terminate: (...args: unknown[]) => terminateMock(...args),
  },
}));

describe('Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    startMock.mockResolvedValue({ workflow_id: 'workflow-1', run_id: 'run-1' });
    signalMock.mockResolvedValue(undefined);
    reprioritizeMock.mockResolvedValue(undefined);
    terminateMock.mockResolvedValue(undefined);
    enqueueMock.mockResolvedValue(undefined);
    statusMock.mockResolvedValue({
      goal: 'Imported reconciliation',
      status: 'running',
      current_task_id: 'desktop-step-1',
      generation: 0,
      turns_completed: 0,
      failures: 0,
      elapsed_active_secs: 30,
      active_window_secs: 3600,
      max_turns: 2,
      tasks_remaining: 2,
      paused: false,
      cancelled: false,
      steering_notes: [],
    });
    vi.stubGlobal('crypto', { randomUUID: () => '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7' });
    useAuthStore.setState({
      tenant: {
        id: 'tenant-1',
        name: 'Tenant',
        slug: 'tenant',
        tier: 'pro',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      currentBrand: {
        id: '29324d30-9571-4f50-bbc2-17b214b74ec7',
        tenant_id: 'tenant-1',
        slug: 'brand',
        name: 'Brand',
        support_platform: 'gorgias',
        ecommerce_platform: 'shopify',
        config: {},
        mcp_servers: [],
        enabled: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });
    useDurableWorkflowsStore.setState({
      initialized: true,
      engineUrl: 'https://api.workstream.stateset.com',
      apiKey: 'durable-key',
      workflows: [],
      customAgents: [],
      blueprints: [],
      schedules: [],
    });
  });

  it('offers a recoverable error instead of an indefinite startup spinner', async () => {
    const original = useDurableWorkflowsStore.getState().initialize;
    const retry = vi.fn().mockResolvedValue(undefined);
    useDurableWorkflowsStore.setState({
      initialized: false,
      initializationError: 'Saved workflow settings could not be loaded.',
      initialize: retry,
    });
    try {
      renderWithProviders(<Workflows />);
      expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
      expect(screen.queryByRole('heading', { name: 'Workflows' })).not.toBeInTheDocument();
      expect(startMock).not.toHaveBeenCalled();
      retry.mockImplementationOnce(async () => {
        useDurableWorkflowsStore.setState({ initialized: true, initializationError: null });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading settings' }));
      await screen.findByRole('heading', { name: 'Workflows' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      act(() => useDurableWorkflowsStore.setState({ initialize: original }));
    }
  });

  it('renders the minimal workflow overview', () => {
    renderWithProviders(<Workflows />);

    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument();
    expect(screen.getByText('Durable execution')).toBeInTheDocument();
    expect(screen.getByText('No workflows yet')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('creates blank-line-separated durable steps', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Reconcile orders' } });
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'download-orders\nvalidate-orders\n\npublish-report' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'Reconcile orders',
        steps: [['download-orders', 'validate-orders'], ['publish-report']],
      })
    );
    expect(useDurableWorkflowsStore.getState().workflows[0].workflowId).toBe('workflow-1');
    expect(useDurableWorkflowsStore.getState().workflows[0].definition).toEqual({
      steps: [['download-orders', 'validate-orders'], ['publish-report']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 600,
      stepAgents: [null, null],
    });
  });

  it('recovers a confirmed launch by its original ID when local tracking fails', async () => {
    let uuidCount = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        uuidCount++;
        return uuidCount === 1
          ? '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7'
          : `00000000-0000-4000-8000-${String(uuidCount).padStart(12, '0')}`;
      },
    });
    const electron = mockElectronAPI();
    let failTracking!: () => void;
    electron.store.set.mockImplementationOnce(
      () =>
        new Promise<false>((resolve) => {
          failTracking = () => resolve(false);
        })
    );
    startMock.mockResolvedValueOnce({ workflow_id: 'workflow-confirmed', run_id: null });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Reconcile once' } });
    fireEvent.change(screen.getByLabelText('Commands'), { target: { value: 'reconcile-orders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => expect(electron.store.set).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', { name: 'New background workflow' })
    ).not.toBeInTheDocument();
    expect(useDurableWorkflowsStore.getState().workflows).toHaveLength(0);
    expect(electron.store.set).toHaveBeenCalledWith('durableTrackedWorkflows', [
      expect.objectContaining({
        workflowId: 'workflow-confirmed',
        runId: '',
        requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      }),
    ]);

    act(() => failTracking());
    expect(
      await screen.findByText('Workflow started; tracking needs attention')
    ).toBeInTheDocument();
    expect(screen.queryByText('Unable to start workflow')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow started', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Workflow ID')).toHaveValue('workflow-confirmed');
    expect(useDurableWorkflowsStore.getState().workflows).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Track workflow' }));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().workflows[0]?.workflowId).toBe(
        'workflow-confirmed'
      )
    );
    expect(statusMock).toHaveBeenCalledWith('tenant-1', 'workflow-confirmed');
    expect(startMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    expect(screen.getByLabelText('Goal')).toHaveValue('');
    expect(screen.getByLabelText('Commands')).toHaveValue('');
  });

  it('launches a specialized agent with the background workflow', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Analyze orders' } });
    fireEvent.click(screen.getByRole('radio', { name: /Data analyst/ }));
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'python3 /workspace/analyze.py' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({ id: 'data-analyst', maxIterations: 16 }),
      })
    );
    expect(useDurableWorkflowsStore.getState().workflows[0].agent?.name).toBe('Data analyst');
  });

  it('assigns different agents to durable workflow steps', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Analyze then review' } });
    fireEvent.click(screen.getByRole('radio', { name: /Data analyst/ }));
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'python3 /workspace/analyze.py\n\ncat /workspace/report.json' },
    });
    fireEvent.click(screen.getByText('Assign agents to steps'));
    fireEvent.change(screen.getByLabelText('Agent for step 2'), {
      target: { value: 'quality-reviewer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stepAgents: [
          expect.objectContaining({ id: 'data-analyst' }),
          expect.objectContaining({ id: 'quality-reviewer' }),
        ],
      })
    );
  });

  it('saves the current multi-step workflow as a reusable blueprint', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Weekly review' } });
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'collect-data\n\nverify-report' },
    });
    fireEvent.click(screen.getByText('Save as reusable blueprint'));
    fireEvent.change(screen.getByLabelText('Blueprint name'), {
      target: { value: 'Weekly review blueprint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save blueprint' }));

    await waitFor(() => expect(useDurableWorkflowsStore.getState().blueprints).toHaveLength(1));
    expect(useDurableWorkflowsStore.getState().blueprints[0]).toMatchObject({
      name: 'Weekly review blueprint',
      goal: 'Weekly review',
      definition: { steps: [['collect-data'], ['verify-report']] },
    });
  });

  it('tracks a workflow that was started from another client', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Track existing' }));
    fireEvent.change(screen.getByLabelText('Workflow ID'), {
      target: { value: 'active-horizon-agent-brand-request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track workflow' }));

    await waitFor(() =>
      expect(statusMock).toHaveBeenCalledWith('tenant-1', 'active-horizon-agent-brand-request')
    );
    expect(useDurableWorkflowsStore.getState().workflows[0]).toMatchObject({
      workflowId: 'active-horizon-agent-brand-request',
      goal: 'Imported reconciliation',
      status: 'running',
    });
  });

  it('prefills a new workflow from a completed local run', () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-old',
          runId: 'run-old',
          requestId: 'request-old',
          tenantId: 'tenant-1',
          brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
          goal: 'Reconcile orders',
          status: 'completed',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:10:00.000Z',
          definition: {
            steps: [['download-orders', 'validate-orders'], ['publish-report']],
            activeWindowSeconds: 7200,
            maxFailures: 5,
            perCommandTimeoutSeconds: 300,
          },
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Reconcile orders'));
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    expect(screen.getByLabelText('Goal')).toHaveValue('Reconcile orders');
    expect(screen.getByLabelText('Commands')).toHaveValue(
      'download-orders\nvalidate-orders\n\npublish-report'
    );
  });

  it('filters and searches a fleet of background workflows', () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-running',
          runId: 'run-1',
          requestId: 'request-1',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Reconcile orders',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          workflowId: 'workflow-complete',
          runId: 'run-2',
          requestId: 'request-2',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Publish inventory report',
          status: 'completed',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Active 1' }));
    expect(screen.getByText('Reconcile orders')).toBeInTheDocument();
    expect(screen.queryByText('Publish inventory report')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All 2' }));
    fireEvent.change(screen.getByLabelText('Search workflows'), {
      target: { value: 'inventory' },
    });
    expect(screen.queryByText('Reconcile orders')).not.toBeInTheDocument();
    expect(screen.getByText('Publish inventory report')).toBeInTheDocument();
  });

  it('pauses running workflows in bounded fleet operations', async () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-running',
          runId: 'run-1',
          requestId: 'request-1',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Running workflow',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          workflowId: 'workflow-paused',
          runId: 'run-2',
          requestId: 'request-2',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Paused workflow',
          status: 'paused',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    statusMock.mockResolvedValueOnce({
      goal: 'Running workflow',
      status: 'paused',
      current_task_id: null,
      generation: 0,
      turns_completed: 0,
      failures: 0,
      elapsed_active_secs: 30,
      active_window_secs: 3600,
      max_turns: 2,
      tasks_remaining: 2,
      paused: true,
      cancelled: false,
      steering_notes: [],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause active' }));

    await waitFor(() =>
      expect(signalMock).toHaveBeenCalledWith('tenant-1', 'workflow-running', 'pause')
    );
    expect(signalMock).not.toHaveBeenCalledWith('tenant-1', 'workflow-paused', 'pause');
  });

  it('keeps a failed row action usable when its error cannot be saved', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    signalMock.mockRejectedValueOnce(new Error('The engine is offline.'));
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-retry',
          runId: 'run-retry',
          requestId: 'request-retry',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Retry this workflow',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Retry this workflow'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByText('Workflow action failed')).toBeInTheDocument();
    const notification = screen.getByRole('alert');
    expect(notification).toHaveTextContent('The engine is offline.');
    expect(notification).toHaveTextContent(
      'Local details could not be saved: Local storage is unavailable.'
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(useDurableWorkflowsStore.getState().workflows[0].lastError).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().workflows[0].details?.status).toBe('running')
    );
    expect(statusMock).toHaveBeenCalledWith('tenant-1', 'workflow-retry');
    expect(signalMock).toHaveBeenCalledTimes(2);
  });

  it('clears an accepted step draft when saving its refreshed status fails', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockResolvedValue(false);
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-enqueue',
          runId: 'run',
          requestId: 'request',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Review inventory',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Review inventory'));
    fireEvent.click(screen.getByText('Adjust workflow'));
    const draft = screen.getByPlaceholderText('One command per line');
    fireEvent.change(draft, { target: { value: 'python3 /workspace/review.py' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(await screen.findByText('Action accepted; status needs attention')).toBeInTheDocument();
    await waitFor(() => expect(draft).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(useDurableWorkflowsStore.getState().workflows[0].details).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('The engine accepted this action.');
  });

  it('retains accepted fleet counts when status and error persistence fail', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockRejectedValue(new Error('Local storage is unavailable.'));
    signalMock.mockImplementation((_tenantId: string, workflowId: string) =>
      workflowId === 'workflow-accepted'
        ? Promise.resolve()
        : Promise.reject(new Error('Signal rejected.'))
    );
    statusMock.mockRejectedValue(new Error('Status is unavailable.'));
    useDurableWorkflowsStore.setState({
      workflows: ['accepted', 'rejected'].map((id) => ({
        workflowId: `workflow-${id}`,
        runId: `run-${id}`,
        requestId: `request-${id}`,
        tenantId: 'tenant-1',
        brandId: 'brand-1',
        goal: `Workflow ${id}`,
        status: 'running',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause active' }));

    expect(await screen.findByText('Fleet action partially completed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 succeeded and 1 failed.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Local details could not be saved: Local storage is unavailable.'
    );
    expect(screen.getByRole('button', { name: 'Pause active' })).toBeEnabled();
    expect(signalMock).toHaveBeenCalledTimes(2);
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(electron.store.set).toHaveBeenCalledTimes(2);
  });

  it('saves a workflow to run later from the desktop tray', async () => {
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Nightly inventory' } });
    fireEvent.change(screen.getByLabelText('Commands'), {
      target: { value: 'python3 /workspace/inventory.py' },
    });
    fireEvent.click(screen.getByText('Schedule for later'));
    fireEvent.change(screen.getByLabelText('Schedule name'), {
      target: { value: 'Nightly inventory schedule' },
    });
    fireEvent.change(screen.getByLabelText('First run'), {
      target: { value: '2026-09-02T02:00' },
    });
    fireEvent.click(screen.getByLabelText('Allow overlapping runs'));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(useDurableWorkflowsStore.getState().schedules).toHaveLength(1));
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      name: 'Nightly inventory schedule',
      goal: 'Nightly inventory',
      frequency: 'once',
      allowOverlap: true,
      enabled: true,
    });
  });

  it('edits future launches without changing the snapshotted workflow', async () => {
    const definition = {
      steps: [['python3 /workspace/inventory.py']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
    };
    useDurableWorkflowsStore.setState({
      schedules: [
        {
          id: 'schedule-edit',
          name: 'Old schedule',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Inventory',
          definition,
          frequency: 'daily',
          nextRunAt: '2026-09-02T02:00:00.000Z',
          enabled: true,
          allowOverlap: false,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit schedule name'), {
      target: { value: 'Updated schedule' },
    });
    fireEvent.change(screen.getByLabelText('Edit next run'), {
      target: { value: '2026-09-03T04:30' },
    });
    fireEvent.change(screen.getByLabelText('Edit schedule frequency'), {
      target: { value: 'weekly' },
    });
    fireEvent.click(screen.getByLabelText('Schedule enabled'));
    fireEvent.click(screen.getByLabelText('Edit allow overlapping runs'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
        name: 'Updated schedule',
        frequency: 'weekly',
        enabled: false,
        allowOverlap: true,
      })
    );
    expect(useDurableWorkflowsStore.getState().schedules[0].definition).toEqual(definition);
  });

  it('keeps a submitted launch unconfirmed and checks it while the schedule is paused', async () => {
    const schedule = pendingSchedule({
      enabled: false,
      lastRunAt: '2026-09-02T02:00:31.000Z',
      lastError: 'Confirmation timed out.',
    });
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    const intent = getScheduleIntentGeneration(schedule.id);
    renderWithProviders(<Workflows />);
    const row = within(screen.getByRole('group', { name: 'Schedule Inventory schedule' }));

    expect(row.getByText('Launch confirmation needs attention')).toBeInTheDocument();
    expect(row.queryByText(/Completed|Run launched/)).not.toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(row.getByRole('button', { name: 'Delete Inventory schedule' })).toBeDisabled();
    fireEvent.click(row.getByRole('button', { name: 'Check pending run' }));

    await waitFor(() =>
      expect(
        useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
      ).toBe(false)
    );
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      enabled: false,
      pendingOccurrence: { ...schedule.pendingOccurrence, needsAttention: false },
    });
    expect(useDurableWorkflowsStore.getState().schedules[0].lastError).toBeUndefined();
    expect(getScheduleIntentGeneration(schedule.id)).toBe(intent);
    expect(row.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(startMock).not.toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('requires the original engine before checking a pending launch', () => {
    const schedule = pendingSchedule();
    schedule.pendingOccurrence!.engineUrl = 'https://original-engine.example.com';
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    renderWithProviders(<Workflows />);
    const row = within(screen.getByRole('group', { name: 'Schedule Inventory schedule' }));
    expect(
      row.getByText(/Pending run belongs to https:\/\/original-engine.example.com/)
    ).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Check pending run' })).toBeDisabled();

    act(() =>
      useDurableWorkflowsStore.setState({ engineUrl: 'https://original-engine.example.com' })
    );
    expect(row.getByRole('button', { name: 'Check pending run' })).toBeEnabled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('retries a known unsent occurrence without changing its frozen identity', async () => {
    const schedule = pendingSchedule();
    schedule.pendingOccurrence!.submitted = false;
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    const intent = getScheduleIntentGeneration(schedule.id);
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry scheduled run' }));

    await waitFor(() =>
      expect(
        useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence?.needsAttention
      ).toBe(false)
    );
    expect(useDurableWorkflowsStore.getState().schedules[0].pendingOccurrence).toEqual({
      ...schedule.pendingOccurrence,
      needsAttention: false,
    });
    expect(getScheduleIntentGeneration(schedule.id)).toBe(intent);
    expect(screen.getByText('Preparing scheduled run')).toBeInTheDocument();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('shows a recoverable error when a pending check cannot be persisted', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    const schedule = pendingSchedule();
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Check pending run' }));

    expect(await screen.findByText('Unable to check pending run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check pending run' })).toBeEnabled();
    expect(useDurableWorkflowsStore.getState().schedules[0]).toEqual(schedule);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('catches a schedule save failure and allows the same action to be retried', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    useDurableWorkflowsStore.setState({ schedules: [scheduleFixture()] });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByText('Unable to update schedule')).toBeInTheDocument();
    expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].enabled).toBe(false)
    );
  });

  it('catches a delete failure without removing the schedule or reporting success', async () => {
    const electron = mockElectronAPI();
    electron.store.set.mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    const schedule = scheduleFixture();
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Inventory schedule' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete schedule' })
    );

    expect(await screen.findByText('Unable to delete schedule')).toBeInTheDocument();
    expect(useDurableWorkflowsStore.getState().schedules).toEqual([schedule]);
    expect(screen.queryByText('Schedule deleted')).not.toBeInTheDocument();
  });

  it('preserves a background launch when only the name is edited in an open dialog', async () => {
    const schedule = scheduleFixture();
    useDurableWorkflowsStore.setState({ schedules: [schedule] });
    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const current = pendingSchedule({
      enabled: false,
      nextRunAt: '2026-09-03T04:30:45.000Z',
      lastError: 'Confirmation timed out.',
    });
    act(() => useDurableWorkflowsStore.setState({ schedules: [current] }));
    fireEvent.change(screen.getByLabelText('Edit schedule name'), {
      target: { value: 'Renamed schedule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(useDurableWorkflowsStore.getState().schedules[0].name).toBe('Renamed schedule')
    );
    expect(useDurableWorkflowsStore.getState().schedules[0]).toMatchObject({
      enabled: false,
      nextRunAt: current.nextRunAt,
      pendingOccurrence: current.pendingOccurrence,
      lastError: current.lastError,
    });
  });

  it('reprioritizes upcoming durable agent handoffs', async () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-queue',
          runId: 'run-queue',
          requestId: 'request-queue',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Multi-agent review',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          definition: {
            steps: [['collect'], ['analyze'], ['review'], ['publish']],
            activeWindowSeconds: 3600,
            maxFailures: 3,
            perCommandTimeoutSeconds: 300,
            stepAgents: [null, null, null, null],
          },
          details: {
            goal: 'Multi-agent review',
            status: 'running',
            current_task_id: 'desktop-step-2',
            generation: 0,
            turns_completed: 1,
            failures: 0,
            elapsed_active_secs: 30,
            active_window_secs: 3600,
            max_turns: 4,
            tasks_remaining: 3,
            paused: false,
            cancelled: false,
            steering_notes: [],
          },
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Multi-agent review'));
    fireEvent.click(screen.getByText('Adjust workflow'));
    await waitFor(() => expect(screen.getByText('Upcoming handoffs')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Move step 4 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply order' }));

    await waitFor(() =>
      expect(reprioritizeMock).toHaveBeenCalledWith('tenant-1', 'workflow-queue', [
        'desktop-step-4',
        'desktop-step-3',
      ])
    );
  });

  it('confirms and records an emergency workflow termination', async () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-stuck',
          runId: 'run-stuck',
          requestId: 'request-stuck',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Stuck workflow',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Stuck workflow'));
    fireEvent.click(screen.getByRole('button', { name: 'Force stop' }));
    expect(terminateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Force stop workflow' }));

    await waitFor(() => expect(terminateMock).toHaveBeenCalledWith('tenant-1', 'workflow-stuck'));
    expect(useDurableWorkflowsStore.getState().workflows[0].status).toBe('terminated');
  });

  it('requires confirmation before requesting graceful cancellation', async () => {
    useDurableWorkflowsStore.setState({
      workflows: [
        {
          workflowId: 'workflow-cancel',
          runId: 'run-cancel',
          requestId: 'request-cancel',
          tenantId: 'tenant-1',
          brandId: 'brand-1',
          goal: 'Cancelable workflow',
          status: 'running',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    renderWithProviders(<Workflows />);
    fireEvent.click(screen.getByText('Cancelable workflow'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signalMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel workflow' }));

    await waitFor(() =>
      expect(signalMock).toHaveBeenCalledWith('tenant-1', 'workflow-cancel', 'cancel')
    );
  });
});
