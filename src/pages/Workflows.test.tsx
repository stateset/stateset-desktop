/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, mockElectronAPI, renderWithProviders, screen, waitFor } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import Workflows from './Workflows';

const startMock = vi.fn();
const statusMock = vi.fn();
const signalMock = vi.fn();
const reprioritizeMock = vi.fn();
const terminateMock = vi.fn();

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
    enqueueStep: vi.fn(),
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
