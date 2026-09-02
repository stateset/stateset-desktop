// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableWorkflowsStore } from './durableWorkflows';
import type { DurableAgentProfile } from '../lib/durableAgentProfiles';

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
