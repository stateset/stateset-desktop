// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkflowConnectionGeneration, useDurableWorkflowsStore } from './durableWorkflows';
import type { DurableAgentProfile } from '../lib/durableAgentProfiles';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('useDurableWorkflowsStore', () => {
  const storeSet = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        store: { get: vi.fn().mockResolvedValue(undefined), set: storeSet },
        auth: {
          getDurableEngineApiKey: vi.fn().mockResolvedValue(undefined),
          setDurableEngineApiKey: vi.fn().mockResolvedValue(true),
          clearDurableEngineApiKey: vi.fn().mockResolvedValue(true),
        },
      },
    });
    useDurableWorkflowsStore.setState({
      initialized: true,
      apiKey: 'key',
      configuring: false,
      connectionRevision: null,
      workflows: [],
      customAgents: [],
      blueprints: [],
      schedules: [],
      engineUrl: 'https://api.workstream.stateset.com',
    });
  });

  it('persists tracked workflows and status updates', async () => {
    const now = new Date().toISOString();
    await useDurableWorkflowsStore.getState().track({
      workflowId: 'wf-1',
      runId: 'run-1',
      requestId: 'request-1',
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      goal: 'Do work',
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    await useDurableWorkflowsStore.getState().updateStatus('wf-1', {
      goal: 'Do work',
      status: 'completed',
      current_task_id: null,
      generation: 1,
      turns_completed: 1,
      failures: 0,
      elapsed_active_secs: 10,
      active_window_secs: 3600,
      max_turns: 1,
      tasks_remaining: 0,
      paused: false,
      cancelled: false,
      steering_notes: [],
    });

    expect(useDurableWorkflowsStore.getState().workflows[0].status).toBe('completed');
    expect(storeSet).toHaveBeenCalled();
  });

  it('keeps local terminal states from being downgraded by stale polling', async () => {
    const now = new Date().toISOString();
    await useDurableWorkflowsStore.getState().track({
      workflowId: 'wf-terminal',
      runId: 'run-terminal',
      requestId: 'request-terminal',
      tenantId: 'tenant-1',
      brandId: 'brand-1',
      goal: 'Stop work',
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    await useDurableWorkflowsStore.getState().markStatus('wf-terminal', 'terminated');
    await useDurableWorkflowsStore.getState().updateStatus('wf-terminal', {
      goal: 'Stop work',
      status: 'running',
      current_task_id: 'desktop-step-1',
      generation: 0,
      turns_completed: 0,
      failures: 0,
      elapsed_active_secs: 1,
      active_window_secs: 3600,
      max_turns: 1,
      tasks_remaining: 1,
      paused: false,
      cancelled: false,
      steering_notes: [],
    });

    expect(useDurableWorkflowsStore.getState().workflows[0].status).toBe('terminated');
  });

  it('serializes configuration writes and keeps them untrusted until the last write finishes', async () => {
    let release!: () => void;
    storeSet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(true);
        })
    );
    const first = useDurableWorkflowsStore
      .getState()
      .setConfiguration('https://first.example', 'first-key');
    const second = useDurableWorkflowsStore
      .getState()
      .setConfiguration('https://second.example', 'second-key');
    expect(useDurableWorkflowsStore.getState().configuring).toBe(true);
    await vi.waitFor(() => expect(storeSet).toHaveBeenCalledOnce());
    release();
    await Promise.all([first, second]);
    expect(storeSet.mock.calls.map((call) => call[1])).toEqual([
      'https://first.example',
      'https://second.example',
    ]);
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      engineUrl: 'https://second.example',
      apiKey: 'second-key',
      configuring: false,
    });
  });
  it('orders credential removal after a pending configuration write', async () => {
    let release!: () => void;
    storeSet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(true);
        })
    );
    const setting = useDurableWorkflowsStore
      .getState()
      .setConfiguration('https://first.example', 'first-key');
    const clearing = useDurableWorkflowsStore.getState().clearApiKey();
    await vi.waitFor(() => expect(storeSet).toHaveBeenCalledOnce());
    release();
    await Promise.all([setting, clearing]);
    expect(window.electronAPI!.auth.clearDurableEngineApiKey).toHaveBeenCalledOnce();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({ apiKey: null, configuring: false });
  });
  it('keeps the configured key and revision until removal is acknowledged, then refreshes the native connection', async () => {
    const pending = deferred<boolean>();
    const clear = vi.fn().mockReturnValue(pending.promise);
    window.electronAPI!.auth.clearDurableEngineApiKey = clear;
    const connection = vi.fn().mockResolvedValue({
      engineUrl: 'https://actual.example',
      revision: 'removed-key-revision',
    });
    window.electronAPI!.computerChat = { getConnection: connection } as never;
    useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });
    const generation = getWorkflowConnectionGeneration();
    const clearing = useDurableWorkflowsStore.getState().clearApiKey();

    expect(getWorkflowConnectionGeneration()).toBe(generation + 1);
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: 'key',
      connectionRevision: 'configured-revision',
      configuring: true,
    });
    await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(connection).not.toHaveBeenCalled();
    pending.resolve(true);
    await clearing;
    expect(connection).toHaveBeenCalledOnce();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: null,
      engineUrl: 'https://actual.example',
      connectionRevision: 'removed-key-revision',
      configuring: false,
    });
  });

  it('keeps acknowledged removal successful when refreshing the connection fails and permits a later save', async () => {
    const connection = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary connection refresh failure'))
      .mockResolvedValue({
        engineUrl: 'https://refreshed.example',
        revision: 'refreshed-revision',
      });
    window.electronAPI!.computerChat = { getConnection: connection } as never;
    useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });
    await expect(useDurableWorkflowsStore.getState().clearApiKey()).resolves.toBeUndefined();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: null,
      connectionRevision: null,
      configuring: false,
    });
    vi.mocked(window.electronAPI!.auth.getDurableEngineApiKey).mockResolvedValueOnce(
      'replacement-key'
    );
    await useDurableWorkflowsStore
      .getState()
      .setConfiguration('https://refreshed.example', 'replacement-key');
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: 'replacement-key',
      engineUrl: 'https://refreshed.example',
      connectionRevision: 'refreshed-revision',
      configuring: false,
    });
  });

  it.each(['rejection', 'false acknowledgement'] as const)(
    'preserves the key on removal %s and continues with an already queued save and later removal',
    async (failure) => {
      const pending = deferred<boolean>();
      const clear = vi
        .fn()
        .mockImplementationOnce(() =>
          pending.promise.then((acknowledgement) => {
            if (failure === 'rejection') throw new Error('Keyring unavailable.');
            return acknowledgement;
          })
        )
        .mockResolvedValue(true);
      window.electronAPI!.auth.clearDurableEngineApiKey = clear;
      useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });
      const clearing = useDurableWorkflowsStore.getState().clearApiKey();
      const rejected = expect(clearing).rejects.toThrow('could not be removed. Try again.');
      const observed: Array<{ key: string | null; revision: string | null }> = [];
      storeSet.mockImplementationOnce(async () => {
        const state = useDurableWorkflowsStore.getState();
        observed.push({ key: state.apiKey, revision: state.connectionRevision });
        return true;
      });
      const saving = useDurableWorkflowsStore
        .getState()
        .setConfiguration('https://new.example', 'replacement-key');

      await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
      expect(storeSet).not.toHaveBeenCalled();
      expect(useDurableWorkflowsStore.getState()).toMatchObject({
        apiKey: 'key',
        connectionRevision: 'configured-revision',
        configuring: true,
      });
      pending.resolve(false);
      await rejected;
      await saving;
      expect(observed).toEqual([{ key: 'key', revision: 'configured-revision' }]);
      expect(useDurableWorkflowsStore.getState()).toMatchObject({
        apiKey: 'replacement-key',
        engineUrl: 'https://new.example',
        configuring: false,
      });
      await useDurableWorkflowsStore.getState().clearApiKey();
      expect(clear).toHaveBeenCalledTimes(2);
      expect(useDurableWorkflowsStore.getState()).toMatchObject({
        apiKey: null,
        configuring: false,
      });
    }
  );

  it.each(['bridge', 'method'] as const)(
    'refuses removal without a native %s and preserves the configured connection for retry',
    async (missing) => {
      const nativeApi = window.electronAPI;
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: missing === 'bridge' ? undefined : { auth: {} },
      });
      useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });

      await expect(useDurableWorkflowsStore.getState().clearApiKey()).rejects.toThrow(
        'Desktop credential storage is unavailable'
      );
      expect(useDurableWorkflowsStore.getState()).toMatchObject({
        apiKey: 'key',
        connectionRevision: 'configured-revision',
        configuring: false,
      });
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: nativeApi });
      await useDurableWorkflowsStore.getState().clearApiKey();
      expect(useDurableWorkflowsStore.getState().apiKey).toBeNull();
    }
  );

  it('accepts a legacy undefined acknowledgement from an actual native clear method', async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    window.electronAPI!.auth.clearDurableEngineApiKey = clear;
    useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });
    await useDurableWorkflowsStore.getState().clearApiKey();
    expect(clear).toHaveBeenCalledOnce();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: null,
      connectionRevision: null,
      configuring: false,
    });
  });

  it('refuses removal before queueing when saved settings have not loaded', async () => {
    useDurableWorkflowsStore.setState({
      initialized: false,
      connectionRevision: 'configured-revision',
    });
    const generation = getWorkflowConnectionGeneration();
    await expect(useDurableWorkflowsStore.getState().clearApiKey()).rejects.toThrow(
      'Saved workflow settings are not loaded'
    );
    expect(getWorkflowConnectionGeneration()).toBe(generation);
    expect(window.electronAPI!.auth.clearDurableEngineApiKey).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: 'key',
      connectionRevision: 'configured-revision',
      configuring: false,
    });
  });

  it('rechecks trusted initialization before executing a queued removal', async () => {
    const pending = deferred<boolean>();
    window.electronAPI!.auth.clearDurableEngineApiKey = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(true);
    useDurableWorkflowsStore.setState({ connectionRevision: 'configured-revision' });
    const first = useDurableWorkflowsStore.getState().clearApiKey();
    const second = useDurableWorkflowsStore.getState().clearApiKey();
    const rejected = expect(second).rejects.toThrow('Saved workflow settings are not loaded');
    await vi.waitFor(() =>
      expect(window.electronAPI!.auth.clearDurableEngineApiKey).toHaveBeenCalledOnce()
    );
    pending.resolve(false);
    const firstRejected = expect(first).rejects.toThrow('could not be removed');
    useDurableWorkflowsStore.setState({ initialized: false });
    await Promise.all([firstRejected, rejected]);
    expect(window.electronAPI!.auth.clearDurableEngineApiKey).toHaveBeenCalledOnce();
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      apiKey: 'key',
      connectionRevision: 'configured-revision',
      configuring: false,
    });
    useDurableWorkflowsStore.setState({ initialized: true });
    await useDurableWorkflowsStore.getState().clearApiKey();
    expect(useDurableWorkflowsStore.getState().apiKey).toBeNull();
  });

  it('reconciles the actual native connection after a partial save fails', async () => {
    window.electronAPI!.computerChat = {
      getConnection: vi.fn().mockResolvedValue({
        engineUrl: 'https://actual.example',
        revision: 'actual-revision',
      }),
    } as never;
    vi.mocked(window.electronAPI!.auth.setDurableEngineApiKey).mockRejectedValueOnce(
      new Error('Keyring unavailable')
    );
    vi.mocked(window.electronAPI!.auth.getDurableEngineApiKey).mockResolvedValueOnce('actual-key');
    await expect(
      useDurableWorkflowsStore.getState().setConfiguration('https://actual.example', 'new-key')
    ).rejects.toThrow('Keyring unavailable');
    expect(useDurableWorkflowsStore.getState()).toMatchObject({
      engineUrl: 'https://actual.example',
      apiKey: 'actual-key',
      connectionRevision: 'actual-revision',
      configuring: false,
    });
  });
  it.each([
    'https://user:secret@example.com',
    'https://example.com/?key=secret',
    'https://example.com/#fragment',
  ])('rejects unsafe connection URL %s before persisting it', async (url) => {
    await expect(useDurableWorkflowsStore.getState().setConfiguration(url, 'key')).rejects.toThrow(
      'without credentials'
    );
    expect(storeSet).not.toHaveBeenCalled();
  });

  it('rejects insecure remote engine URLs', async () => {
    await expect(
      useDurableWorkflowsStore.getState().setConfiguration('http://example.com', 'key')
    ).rejects.toThrow('HTTPS');
  });

  it('persists and removes bounded custom agent profiles', async () => {
    const profile: DurableAgentProfile = {
      id: 'custom-inventory',
      name: 'Inventory agent',
      description: 'Checks inventory',
      provider: 'openai',
      connectorKey: 'openai-primary',
      model: 'gpt-5.4',
      systemPrompt: 'Check inventory and cite evidence.',
      maxIterations: 10,
      allowedExecutables: ['rg', 'jq'],
      maxTokens: 1024,
      maxTotalTokens: 20_000,
    };

    await useDurableWorkflowsStore.getState().saveCustomAgent(profile);
    expect(useDurableWorkflowsStore.getState().customAgents).toEqual([profile]);

    await useDurableWorkflowsStore.getState().removeCustomAgent(profile.id);
    expect(useDurableWorkflowsStore.getState().customAgents).toEqual([]);
    expect(storeSet).toHaveBeenCalledWith('durableCustomAgentProfiles', []);
  });

  it('rejects custom profiles with unsafe executables', async () => {
    await expect(
      useDurableWorkflowsStore.getState().saveCustomAgent({
        id: 'custom-unsafe',
        name: 'Unsafe',
        description: '',
        provider: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Run anything.',
        maxIterations: 10,
        allowedExecutables: ['bash'],
        maxTokens: 1024,
        maxTotalTokens: 20_000,
      })
    ).rejects.toThrow('invalid');
  });

  it('persists reusable workflow blueprints', async () => {
    const now = new Date().toISOString();
    const blueprint = {
      id: 'blueprint-inventory',
      name: 'Inventory review',
      goal: 'Review inventory',
      definition: {
        steps: [['python3 /workspace/review.py']],
        activeWindowSeconds: 3600,
        maxFailures: 3,
        perCommandTimeoutSeconds: 300,
        stepAgents: [null],
      },
      createdAt: now,
      updatedAt: now,
    };

    await useDurableWorkflowsStore.getState().saveBlueprint(blueprint);
    expect(useDurableWorkflowsStore.getState().blueprints).toEqual([blueprint]);

    await useDurableWorkflowsStore.getState().removeBlueprint(blueprint.id);
    expect(useDurableWorkflowsStore.getState().blueprints).toEqual([]);
    expect(storeSet).toHaveBeenCalledWith('durableWorkflowBlueprints', []);
  });

  it('persists credential-safe desktop workflow schedules', async () => {
    const now = new Date().toISOString();
    const schedule = {
      id: 'schedule-inventory',
      name: 'Daily inventory',
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
      frequency: 'daily' as const,
      nextRunAt: new Date(Date.now() + 60_000).toISOString(),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    await useDurableWorkflowsStore.getState().saveSchedule(schedule);
    expect(useDurableWorkflowsStore.getState().schedules).toEqual([schedule]);
    expect(storeSet).toHaveBeenCalledWith('durableWorkflowSchedules', [schedule]);

    await useDurableWorkflowsStore.getState().removeSchedule(schedule.id);
    expect(useDurableWorkflowsStore.getState().schedules).toEqual([]);
  });
});
