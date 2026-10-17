import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertNoInlineSecrets,
  durableWorkflowApi,
  type StartDurableWorkflowInput,
} from './durableWorkflows';
import { DURABLE_AGENT_PROFILES } from './durableAgentProfiles';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';

function startInput(overrides: Partial<StartDurableWorkflowInput> = {}): StartDurableWorkflowInput {
  return {
    tenantId: 'tenant-1',
    brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
    requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
    goal: 'Review inventory evidence',
    steps: [['cat /workspace/inventory.json']],
    activeWindowSeconds: 3600,
    maxFailures: 3,
    perCommandTimeoutSeconds: 300,
    ...overrides,
  };
}

describe('durableWorkflowApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDurableWorkflowsStore.setState({
      initialized: true,
      engineUrl: 'https://api.workstream.stateset.com/',
      apiKey: 'durable-key',
      workflows: [],
    });
  });

  it('refuses requests and event streams while saved configuration is untrusted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useDurableWorkflowsStore.setState({ initialized: false });
    await expect(durableWorkflowApi.health('tenant-1')).rejects.toThrow(/settings.*not loaded/i);
    await expect(
      durableWorkflowApi.streamEvents('tenant-1', 'workflow', { onEvent: vi.fn() })
    ).rejects.toThrow(/settings.*not loaded/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts an active-horizon workflow with one sandbox child per durable step', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workflow_id: 'wf-1', run_id: 'run-1' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await durableWorkflowApi.start({
      tenantId: 'tenant-1',
      brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
      requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      goal: 'Reconcile data',
      steps: [['download input', 'validate input'], ['publish result']],
      activeWindowSeconds: 7200,
      maxFailures: 3,
      perCommandTimeoutSeconds: 600,
    });

    expect(result).toEqual({ workflow_id: 'wf-1', run_id: 'run-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.workstream.stateset.com/v1/workflows/active-horizon-agent/start');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer durable-key',
      'x-tenant-id': 'tenant-1',
    });
    const body = JSON.parse(String(init.body));
    expect(body.max_turns).toBe(2);
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0].payload.commands).toEqual([
      ['sh', '-lc', 'download input'],
      ['sh', '-lc', 'validate input'],
    ]);
    expect(body.tasks[1].payload.commands).toEqual([['sh', '-lc', 'publish result']]);
  });

  it('starts bounded model-driven agents inside sandbox tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workflow_id: 'wf-agent', run_id: 'run-agent' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const agent = DURABLE_AGENT_PROFILES.find((profile) => profile.id === 'data-analyst');

    await durableWorkflowApi.start({
      tenantId: 'tenant-1',
      brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
      requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      goal: 'Analyze the export',
      steps: [['python3', '--version']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
      agent,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tasks[0].payload.agent).toMatchObject({
      objective: 'Analyze the export (step 1 of 1)',
      provider: 'openai',
      connector_key: 'openai-primary',
      model: 'gpt-5.4',
      max_iterations: 16,
      allowed_executables: expect.arrayContaining(['python3', 'jq']),
      max_total_tokens: 49152,
    });
    expect(body.tasks[0].payload.session.budget.iteration_limit).toBe(20);
  });

  it('supports durable handoffs between different step agents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workflow_id: 'wf-team', run_id: 'run-team' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const analyst = DURABLE_AGENT_PROFILES.find((profile) => profile.id === 'data-analyst')!;
    const reviewer = DURABLE_AGENT_PROFILES.find((profile) => profile.id === 'quality-reviewer')!;

    await durableWorkflowApi.start({
      tenantId: 'tenant-1',
      brandId: '29324d30-9571-4f50-bbc2-17b214b74ec7',
      requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      goal: 'Analyze then review',
      steps: [['python3 /workspace/analyze.py'], ['cat /workspace/report.json']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
      stepAgents: [analyst, reviewer],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tasks[0].payload.agent.system_prompt).toContain('data analyst');
    expect(body.tasks[1].payload.agent.system_prompt).toContain('quality reviewer');
    expect(body.tasks[0].payload.session.name).not.toBe(body.tasks[1].payload.session.name);
  });

  describe('engine agent request limits', () => {
    it.each([
      ['system prompt', { systemPrompt: '界'.repeat(4001) }],
      ['model', { model: 'é'.repeat(65) }],
      ['connector key', { connectorKey: 'é'.repeat(65) }],
    ] as const)(
      'rejects an over-limit UTF-8 %s before starting work',
      async (_field, overrides) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const agent = { ...DURABLE_AGENT_PROFILES[0], ...overrides };

        await expect(durableWorkflowApi.start(startInput({ agent }))).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it('rejects an over-limit appended agent before changing the workflow budget', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        durableWorkflowApi.enqueueStep({
          tenantId: 'tenant-1',
          workflowId: 'workflow-1',
          requestId: 'request-1',
          goal: 'Inspect the next inventory report',
          commands: ['cat /workspace/report.json'],
          timeoutSeconds: 300,
          agent: { ...DURABLE_AGENT_PROFILES[0], systemPrompt: '界'.repeat(4001) },
        })
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('validates later step agents before posting any part of a workflow', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        durableWorkflowApi.start(
          startInput({
            steps: [['cat input.json'], ['jq . input.json'], ['cat report.json']],
            stepAgents: [
              DURABLE_AGENT_PROFILES[0],
              null,
              { ...DURABLE_AGENT_PROFILES[1], systemPrompt: '界'.repeat(4001) },
            ],
          })
        )
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['start', 'append'] as const)(
      'preserves raw agent strings at the exact UTF-8 limits during %s',
      async (operation) => {
        const fetchMock = vi
          .fn()
          .mockImplementation(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const agent = {
          ...DURABLE_AGENT_PROFILES[0],
          systemPrompt: ` ${'界'.repeat(3999)} \n`,
          model: ` ${'é'.repeat(63)} `,
          connectorKey: ` ${'é'.repeat(63)} `,
        };

        if (operation === 'start') {
          await durableWorkflowApi.start(startInput({ agent }));
        } else {
          await durableWorkflowApi.enqueueStep({
            tenantId: 'tenant-1',
            workflowId: 'workflow-1',
            requestId: 'request-1',
            goal: 'Inspect the next inventory report',
            commands: ['cat /workspace/report.json'],
            timeoutSeconds: 300,
            agent,
          });
        }

        expect(fetchMock).toHaveBeenCalledTimes(operation === 'start' ? 1 : 2);
        const [, init] = fetchMock.mock.calls[operation === 'start' ? 0 : 1] as [
          string,
          RequestInit,
        ];
        expect(init.method).toBe('POST');
        const body = JSON.parse(String(init.body));
        const wireAgent = (operation === 'start' ? body.tasks[0] : body).payload.agent;
        expect(wireAgent).toMatchObject({
          system_prompt: agent.systemPrompt,
          model: agent.model,
          connector_key: agent.connectorKey,
        });
        const encoder = new TextEncoder();
        for (const [field, original, expectedBytes] of [
          ['system_prompt', agent.systemPrompt, 12_000],
          ['model', agent.model, 128],
          ['connector_key', agent.connectorKey, 128],
        ] as const) {
          const wireBytes = encoder.encode(wireAgent[field]);
          expect(wireBytes).toEqual(encoder.encode(original));
          expect(wireBytes.byteLength).toBe(expectedBytes);
        }
      }
    );

    it('keeps command-runner steps independent of an unused default agent', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await durableWorkflowApi.start(
        startInput({
          agent: { ...DURABLE_AGENT_PROFILES[0], systemPrompt: '界'.repeat(4001) },
          stepAgents: [null],
        })
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.tasks[0].payload).not.toHaveProperty('agent');
      expect(body.tasks[0].payload.commands).toEqual([
        ['sh', '-lc', 'cat /workspace/inventory.json'],
      ]);
      expect(body.tasks[0].payload.session.budget.iteration_limit).toBe(3);
    });
  });

  it('retries authentication with ApiKey after a Bearer 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await durableWorkflowApi.health('tenant-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'ApiKey durable-key',
    });
  });

  it('streams authenticated workflow events and resumes after the last event', async () => {
    const body = [
      'id: 42',
      'event: activity_completed',
      'data: {"event_id":42,"kind":"activity_completed","ts":"2026-09-01T12:00:00Z","activity":"run_sandbox"}',
      '',
      'event: malformed_event',
      'data: {"kind":"malformed_event","error":"ignored because it has no event id"}',
      '',
    ].join('\n');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: unknown[] = [];

    await durableWorkflowApi.streamEvents('tenant-1', 'workflow/with spaces', {
      lastEventId: 41,
      onEvent: (event) => events.push(event),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.workstream.stateset.com/v1/workflows/workflow%2Fwith%20spaces/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer durable-key',
          'Last-Event-ID': '41',
          'x-tenant-id': 'tenant-1',
        }),
      })
    );
    expect(events).toEqual([
      expect.objectContaining({
        event_id: 42,
        kind: 'activity_completed',
        activity: 'run_sandbox',
      }),
    ]);
  });

  it('surfaces errors sent by the workflow event stream', async () => {
    const body = [
      'event: stream_error',
      'data: {"kind":"stream_error","error":"temporal connection unavailable"}',
      '',
    ].join('\n');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(
      durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', { onEvent: vi.fn() })
    ).rejects.toThrow('temporal connection unavailable');
  });

  it('fails closed when durable engine credentials are missing', async () => {
    useDurableWorkflowsStore.setState({ apiKey: null });
    await expect(durableWorkflowApi.health('tenant-1')).rejects.toThrow('Configure');
  });

  it('extends the turn budget before enqueueing a new sandbox step', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await durableWorkflowApi.enqueueStep({
      tenantId: 'tenant-1',
      workflowId: 'active-horizon-agent-brand-request',
      requestId: '0aa616a8-1241-4b8a-a3ae-2f79fa72b1e7',
      goal: 'Added work',
      commands: ['run-new-step'],
      timeoutSeconds: 600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/extend-budget');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      additional_turns: 1,
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/enqueue');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      workflow_type: 'SandboxAgentLoopWorkflow',
      payload: { commands: [['sh', '-lc', 'run-new-step']] },
    });
  });

  it('reprioritizes only the explicitly ordered pending tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await durableWorkflowApi.reprioritize('tenant-1', 'workflow/queue', [
      'desktop-step-4',
      'desktop-step-3',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.workstream.stateset.com/v1/workflows/active-horizon-agent/workflow%2Fqueue/reprioritize',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ task_ids: ['desktop-step-4', 'desktop-step-3'] }),
      })
    );
  });

  it('force terminates a workflow through the dedicated engine endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await durableWorkflowApi.terminate('tenant-1', 'workflow/stuck');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.workstream.stateset.com/v1/workflows/active-horizon-agent/workflow%2Fstuck/terminate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects inline credentials but permits managed secret references', async () => {
    expect(() => assertNoInlineSecrets(['export API_KEY=$STATESET_API_KEY'])).not.toThrow();
    expect(() => assertNoInlineSecrets(['curl --token "${WORKFLOW_TOKEN}" /run'])).not.toThrow();
    expect(() => assertNoInlineSecrets(['export API_KEY=sk-live-plaintext'])).toThrow(
      'Inline credentials'
    );
    expect(() => assertNoInlineSecrets(['tool --password hunter2'])).toThrow('Inline credentials');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      durableWorkflowApi.enqueueStep({
        tenantId: 'tenant-1',
        workflowId: 'workflow-1',
        requestId: 'request-1',
        goal: 'Unsafe work',
        commands: ['TOKEN=plaintext-value run-task'],
        timeoutSeconds: 60,
      })
    ).rejects.toThrow('Inline credentials');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
