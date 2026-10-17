// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableWorkflowsStore as workflows } from './durableWorkflows';
import { DURABLE_AGENT_PROFILES } from '../lib/durableAgentProfiles';

const savedUrl = 'https://saved-engine.example';
const savedWorkflow = {
  workflowId: 'saved-workflow',
  runId: 'saved-run',
  requestId: 'request',
  tenantId: 'tenant',
  brandId: 'brand',
  goal: 'Preserve work',
  status: 'running',
  createdAt: '2026-10-17',
  updatedAt: '2026-10-17',
};
const initialize = workflows.getState().initialize;
let nativeUrl: string;
let nativeKey: string;
let get: ReturnType<typeof vi.fn>;
let getKey: ReturnType<typeof vi.fn>;
let getConnection: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nativeUrl = savedUrl;
  nativeKey = 'saved-key';
  get = vi.fn(async (name: string) =>
    name === 'durableWorkflowEngineUrl'
      ? nativeUrl
      : name === 'durableTrackedWorkflows'
        ? [savedWorkflow]
        : []
  );
  getKey = vi.fn(async () => nativeKey);
  getConnection = vi.fn(async () => ({ engineUrl: nativeUrl, revision: `revision-${nativeUrl}` }));
  set = vi.fn(async (name: string, value: string) => {
    if (name === 'durableWorkflowEngineUrl') nativeUrl = value;
    return true;
  });
  window.electronAPI = {
    store: { get, set },
    auth: {
      getDurableEngineApiKey: getKey,
      setDurableEngineApiKey: vi.fn(async (key: string) => {
        nativeKey = key;
        return true;
      }),
    },
    computerChat: { getConnection },
  } as never;
  workflows.setState({
    initialize,
    initialized: false,
    initializationError: null,
    configuring: false,
    engineUrl: 'https://fallback.example',
    apiKey: null,
    connectionRevision: null,
    workflows: [],
    customAgents: [],
    blueprints: [],
    schedules: [],
  } as never);
});

describe('saved workflow initialization recovery', () => {
  it('retains legacy agent byte overflows in profiles, blueprints and pending schedules', async () => {
    const legacy = {
      ...DURABLE_AGENT_PROFILES[0],
      id: 'custom-legacy',
      systemPrompt: '界'.repeat(4001),
      model: '界'.repeat(43),
      connectorKey: '界'.repeat(43),
    };
    const definition = {
      steps: [['inspect-inventory']],
      agent: legacy,
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
    };
    const at = '2026-10-17T12:00:00.000Z';
    const blueprint = {
      id: 'blueprint-legacy',
      name: 'Legacy review',
      goal: 'Review inventory',
      definition,
      createdAt: at,
      updatedAt: at,
    };
    const schedule = {
      id: 'schedule-legacy',
      name: 'Legacy scheduled review',
      tenantId: 'tenant',
      brandId: '22222222-2222-4222-8222-222222222222',
      goal: 'Review inventory',
      definition,
      frequency: 'once',
      nextRunAt: at,
      enabled: false,
      createdAt: at,
      updatedAt: at,
      pendingOccurrence: {
        requestId: '33333333-3333-4333-8333-333333333333',
        dueAt: at,
        engineUrl: savedUrl,
        tenantId: 'tenant',
        brandId: '22222222-2222-4222-8222-222222222222',
        goal: 'Review inventory',
        definition,
        claimedAt: at,
        workflowId:
          'active-horizon-agent-22222222222242228222222222222222-33333333333343338333333333333333',
        submitted: true,
        needsAttention: true,
      },
    };
    get.mockImplementation(async (name: string) => {
      if (name === 'durableWorkflowEngineUrl') return savedUrl;
      if (name === 'durableTrackedWorkflows') return [savedWorkflow];
      if (name === 'durableCustomAgentProfiles') return [legacy];
      if (name === 'durableWorkflowBlueprints') return [blueprint];
      if (name === 'durableWorkflowSchedules') return [schedule];
      return [];
    });
    await initialize();
    expect(workflows.getState()).toMatchObject({
      initialized: true,
      initializationError: null,
      customAgents: [legacy],
      blueprints: [blueprint],
      schedules: [schedule],
    });
    expect(set).not.toHaveBeenCalled();
  });

  it.each(['store', 'keyring', 'native connection'])(
    'retries an atomic load after a transient %s read rejection',
    async (source) => {
      const target = source === 'store' ? get : source === 'keyring' ? getKey : getConnection;
      target.mockRejectedValueOnce(new Error('Temporary private storage detail'));
      await initialize();
      expect(workflows.getState()).toMatchObject({
        initialized: false,
        apiKey: null,
        connectionRevision: null,
        workflows: [],
        initializationError: expect.stringContaining('Retry'),
      });
      expect(JSON.stringify(workflows.getState())).not.toContain(
        'Temporary private storage detail'
      );
      await initialize();
      expect(workflows.getState()).toMatchObject({
        initialized: true,
        initializationError: null,
        engineUrl: savedUrl,
        apiKey: 'saved-key',
        workflows: [savedWorkflow],
      });
    }
  );

  it('can retry after a local bridge getter throws synchronously', async () => {
    get.mockImplementationOnce(() => {
      throw new Error('Synchronous IPC failure');
    });
    await initialize();
    expect(workflows.getState().initialized).toBe(false);
    await initialize();
    expect(workflows.getState()).toMatchObject({
      initialized: true,
      initializationError: null,
      engineUrl: savedUrl,
      apiKey: 'saved-key',
      workflows: [savedWorkflow],
    });
  });

  it('shares one in-flight atomic retry between callers', async () => {
    let finish!: (value: unknown) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = initialize();
    const second = initialize();
    expect(getConnection).toHaveBeenCalledOnce();
    finish(savedUrl);
    await Promise.all([first, second]);
    expect(get).toHaveBeenCalledTimes(5);
    expect(workflows.getState().initialized).toBe(true);
  });

  it('preserves a newer connection saved after initialization reads began', async () => {
    let finish!: (value: unknown) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const loading = initialize();
    await workflows.getState().setConfiguration('https://new-engine.example', 'new-key');
    finish(savedUrl);
    await loading;
    expect(workflows.getState()).toMatchObject({
      initialized: true,
      engineUrl: 'https://new-engine.example',
      apiKey: 'new-key',
      connectionRevision: 'revision-https://new-engine.example',
    });
  });

  it('drains every pending connection write before taking a retry snapshot', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    set.mockImplementationOnce(
      (_name: string, value: string) =>
        new Promise<boolean>((resolve) => {
          finishFirst = () => {
            nativeUrl = value;
            resolve(true);
          };
        })
    );
    set.mockImplementationOnce(
      (_name: string, value: string) =>
        new Promise<boolean>((resolve) => {
          finishSecond = () => {
            nativeUrl = value;
            resolve(true);
          };
        })
    );
    const first = workflows
      .getState()
      .setConfiguration('https://first-engine.example', 'first-key');
    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
    const loading = initialize();
    const readsBeforeFirstFinished = get.mock.calls.length;
    const second = workflows
      .getState()
      .setConfiguration('https://second-engine.example', 'second-key');
    finishFirst();
    await first;
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    const readsBeforeSecondFinished = get.mock.calls.length;
    finishSecond();
    await Promise.all([second, loading]);
    expect(readsBeforeFirstFinished).toBe(0);
    expect(readsBeforeSecondFinished).toBe(0);
    expect(workflows.getState()).toMatchObject({
      initialized: true,
      engineUrl: 'https://second-engine.example',
      apiKey: 'second-key',
      connectionRevision: 'revision-https://second-engine.example',
    });
  });

  it('does not replace unread saved arrays from the empty fallback state', async () => {
    get.mockRejectedValueOnce(new Error('Temporary IPC read failure'));
    await initialize();
    await expect(
      workflows.getState().track({ ...savedWorkflow, workflowId: 'new-workflow' })
    ).rejects.toThrow(/load|Retry/i);
    expect(set).not.toHaveBeenCalled();
    expect(workflows.getState().workflows).toEqual([]);
    await initialize();
    await workflows.getState().track({ ...savedWorkflow, workflowId: 'new-workflow' });
    expect(workflows.getState().workflows.map((workflow) => workflow.workflowId)).toEqual([
      'new-workflow',
      'saved-workflow',
    ]);
    expect(set).toHaveBeenCalledWith(
      'durableTrackedWorkflows',
      expect.arrayContaining([savedWorkflow])
    );
  });
});
