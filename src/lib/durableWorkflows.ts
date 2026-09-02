import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import type { DurableAgentProfile } from './durableAgentProfiles';
import { assertNoInlineSecrets } from './workflowCommandSecurity';
export { assertNoInlineSecrets } from './workflowCommandSecurity';

export interface DurableWorkflowLedgerEntry {
  generation: number;
  turn: number;
  task_id: string;
  status: string;
  note: string;
}

export interface DurableWorkflowEvent {
  event_id: number;
  kind: string;
  ts: string;
  activity?: string;
  attempt?: number;
  signal?: string;
  preview?: string;
  error?: string;
}

export interface StreamDurableWorkflowEventsOptions {
  signal?: AbortSignal;
  lastEventId?: number;
  onEvent: (event: DurableWorkflowEvent) => void;
}

export interface DurableWorkflowStatus {
  goal: string;
  status: string;
  current_task_id: string | null;
  generation: number;
  turns_completed: number;
  failures: number;
  elapsed_active_secs: number;
  active_window_secs: number;
  max_turns: number;
  tasks_remaining: number;
  paused: boolean;
  cancelled: boolean;
  steering_notes: string[];
}

export interface StartDurableWorkflowInput {
  tenantId: string;
  brandId: string;
  requestId: string;
  goal: string;
  steps: string[][];
  activeWindowSeconds: number;
  maxFailures: number;
  perCommandTimeoutSeconds: number;
  agent?: DurableAgentProfile;
  stepAgents?: Array<DurableAgentProfile | null>;
}

export interface StartDurableWorkflowResult {
  workflow_id: string;
  run_id: string;
}

export interface EnqueueDurableStepInput {
  tenantId: string;
  workflowId: string;
  requestId: string;
  goal: string;
  commands: string[];
  timeoutSeconds: number;
  agent?: DurableAgentProfile;
}

export interface ExtendDurableWorkflowBudgetInput {
  tenantId: string;
  workflowId: string;
  additionalWindowSeconds?: number;
  additionalTurns?: number;
  additionalFailures?: number;
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  tenantId: string;
  body?: unknown;
};

function configuredClient() {
  const { engineUrl, apiKey } = useDurableWorkflowsStore.getState();
  if (!engineUrl.trim() || !apiKey?.trim()) {
    throw new Error('Configure the durable workflow engine URL and API key first.');
  }
  return { baseUrl: engineUrl.trim().replace(/\/+$/, ''), apiKey: apiKey.trim() };
}

async function engineRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { baseUrl, apiKey } = configuredClient();
  const authSchemes = ['Bearer', 'ApiKey'] as const;
  let lastResponse: Response | null = null;

  for (const scheme of authSchemes) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `${scheme} ${apiKey}`,
        'Content-Type': 'application/json',
        'x-tenant-id': options.tenantId,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    lastResponse = response;
    if (response.status === 401 && scheme === 'Bearer') continue;

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      const record =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const message =
        (typeof record.message === 'string' && record.message) ||
        (typeof record.error === 'string' && record.error) ||
        (typeof payload === 'string' && payload) ||
        `Durable workflow engine returned ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  throw new Error(
    `Durable workflow engine authentication failed (${lastResponse?.status ?? 401}).`
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseWorkflowEvent(block: string): DurableWorkflowEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (event.kind === 'stream_error') {
    throw new Error(
      typeof event.error === 'string' ? event.error : 'The workflow event stream stopped.'
    );
  }
  if (
    typeof event.event_id !== 'number' ||
    !Number.isSafeInteger(event.event_id) ||
    typeof event.kind !== 'string' ||
    typeof event.ts !== 'string'
  ) {
    return null;
  }
  return event as unknown as DurableWorkflowEvent;
}

async function streamWorkflowEvents(
  tenantId: string,
  workflowId: string,
  options: StreamDurableWorkflowEventsOptions
): Promise<void> {
  const { baseUrl, apiKey } = configuredClient();
  const authSchemes = ['Bearer', 'ApiKey'] as const;

  for (const scheme of authSchemes) {
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `${scheme} ${apiKey}`,
      'x-tenant-id': tenantId,
    };
    if (options.lastEventId && options.lastEventId > 0) {
      headers['Last-Event-ID'] = String(options.lastEventId);
    }

    const response = await fetch(
      `${baseUrl}/v1/workflows/${encodeURIComponent(workflowId)}/events`,
      { headers, signal: options.signal }
    );
    if (response.status === 401 && scheme === 'Bearer') continue;
    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new Error(message || `Workflow event stream returned ${response.status}`);
    }
    if (!response.body) throw new Error('Workflow event stream did not return a response body.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamComplete = false;
    while (!streamComplete) {
      const { done, value } = await reader.read();
      streamComplete = done;
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = parseWorkflowEvent(buffer.slice(0, boundary));
        if (event) options.onEvent(event);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      if (done) {
        const event = parseWorkflowEvent(buffer);
        if (event) options.onEvent(event);
        return;
      }
    }
  }

  throw new Error('Durable workflow engine authentication failed (401).');
}

function sandboxTask(params: {
  taskId: string;
  description: string;
  sessionName: string;
  commands: string[];
  timeoutSeconds: number;
  agent?: DurableAgentProfile;
}) {
  const timeoutSeconds = clamp(params.timeoutSeconds, 30, 1_800);
  const commands = params.commands.map((command) => ['sh', '-lc', command]);
  return {
    task_id: params.taskId,
    description: params.description,
    workflow_type: 'SandboxAgentLoopWorkflow',
    payload: {
      session: {
        name: params.sessionName,
        description: params.description,
        cpus: '1',
        memory: '1Gi',
        isolation: 'gvisor',
        sandbox_timeout_seconds: timeoutSeconds,
        budget: {
          iteration_limit: commands.length + (params.agent?.maxIterations ?? 0) + 2,
          duration_limit_seconds: timeoutSeconds,
        },
        rotation: {},
        client_id: params.sessionName,
      },
      commands,
      per_exec_timeout_ms: timeoutSeconds * 1_000,
      agent: params.agent
        ? {
            objective: params.description,
            provider: params.agent.provider,
            connector_key: params.agent.connectorKey,
            model: params.agent.model,
            system_prompt: params.agent.systemPrompt,
            max_iterations: params.agent.maxIterations,
            allowed_executables: params.agent.allowedExecutables,
            max_tokens: params.agent.maxTokens,
            max_total_tokens: params.agent.maxTotalTokens,
          }
        : undefined,
    },
  };
}

export const durableWorkflowApi = {
  health: async (tenantId: string): Promise<void> => {
    await engineRequest<unknown>('/health', { tenantId });
  },

  start: async (input: StartDurableWorkflowInput): Promise<StartDurableWorkflowResult> => {
    assertNoInlineSecrets(input.steps);
    const activeWindowSeconds = clamp(input.activeWindowSeconds, 300, 86_400);
    const timeoutSeconds = clamp(input.perCommandTimeoutSeconds, 30, 1_800);
    const tasks = input.steps.map((step, index) => {
      const agent = input.stepAgents ? (input.stepAgents[index] ?? undefined) : input.agent;
      return sandboxTask({
        taskId: `desktop-step-${index + 1}`,
        description: `${input.goal} (step ${index + 1} of ${input.steps.length})`,
        sessionName: `desktop-${input.requestId}-step-${index + 1}`,
        commands: step,
        timeoutSeconds,
        agent,
      });
    });

    return engineRequest<StartDurableWorkflowResult>('/v1/workflows/active-horizon-agent/start', {
      method: 'POST',
      tenantId: input.tenantId,
      body: {
        brand_id: input.brandId,
        request_id: input.requestId,
        goal: input.goal,
        tasks,
        allowed_workflow_types: ['SandboxAgentLoopWorkflow'],
        active_window_secs: activeWindowSeconds,
        max_turns: tasks.length,
        max_failures: clamp(input.maxFailures, 1, 100),
        turn_timeout_secs: timeoutSeconds,
        checkpoint_every_turns: 1,
      },
    });
  },

  status: (tenantId: string, workflowId: string) =>
    engineRequest<DurableWorkflowStatus>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(workflowId)}/status`,
      { tenantId }
    ),

  streamEvents: streamWorkflowEvents,

  signal: (tenantId: string, workflowId: string, signal: 'pause' | 'resume' | 'cancel') =>
    engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(workflowId)}/${signal}`,
      { method: 'POST', tenantId }
    ),

  terminate: (tenantId: string, workflowId: string) =>
    engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(workflowId)}/terminate`,
      { method: 'POST', tenantId }
    ),

  steer: (tenantId: string, workflowId: string, note: string) =>
    engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(workflowId)}/steer`,
      { method: 'POST', tenantId, body: { note } }
    ),

  reprioritize: (tenantId: string, workflowId: string, taskIds: string[]) => {
    if (!taskIds.length) throw new Error('Choose at least one pending task to reprioritize.');
    if (taskIds.length > 500) throw new Error('A workflow queue cannot exceed 500 tasks.');
    return engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(workflowId)}/reprioritize`,
      {
        method: 'POST',
        tenantId,
        body: { task_ids: taskIds },
      }
    );
  },

  extendBudget: (input: ExtendDurableWorkflowBudgetInput) =>
    engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(input.workflowId)}/extend-budget`,
      {
        method: 'POST',
        tenantId: input.tenantId,
        body: {
          additional_window_secs: Math.max(0, Math.floor(input.additionalWindowSeconds ?? 0)),
          additional_turns: Math.max(0, Math.floor(input.additionalTurns ?? 0)),
          additional_failures: Math.max(0, Math.floor(input.additionalFailures ?? 0)),
        },
      }
    ),

  enqueueStep: async (input: EnqueueDurableStepInput) => {
    if (!input.commands.length) throw new Error('The new step must include at least one command.');
    assertNoInlineSecrets(input.commands);
    // Enqueued work consumes one additional supervisor turn. Extend the turn
    // budget first so the task cannot be accepted but left permanently starved.
    await durableWorkflowApi.extendBudget({
      tenantId: input.tenantId,
      workflowId: input.workflowId,
      additionalTurns: 1,
    });
    return engineRequest<unknown>(
      `/v1/workflows/active-horizon-agent/${encodeURIComponent(input.workflowId)}/enqueue`,
      {
        method: 'POST',
        tenantId: input.tenantId,
        body: sandboxTask({
          taskId: `desktop-added-${input.requestId.slice(0, 12)}`,
          description: input.goal,
          sessionName: `desktop-added-${input.requestId}`,
          commands: input.commands,
          timeoutSeconds: input.timeoutSeconds,
          agent: input.agent,
        }),
      }
    );
  },
};
