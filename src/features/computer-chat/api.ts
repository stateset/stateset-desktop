import { z } from 'zod';
import { sandboxRequest, SandboxRequestError } from '../../lib/sandbox';
import { engineRequest } from '../../lib/durableWorkflows';
import { localSecretsApi } from '../../lib/localSecrets';
import sandboxSessionConfiguration from './sandbox-session.json';
import { ChatIssueError } from './chatIssue';
import { sandboxCapabilitiesSchema } from './sandboxReadiness';
import type {
  ActionResult,
  ComputerAction,
  ComputerChat,
  ComputerSession,
  PendingAction,
  PolicyReceipt,
} from './types';

export { POLICY_API_URL, POLICY_CONNECTION } from './nsrDecisions';
import {
  POLICY_CONNECTION,
  decisionFact,
  evidenceDigest,
  requestNsrDecision,
} from './nsrDecisions';

export const actionSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('screenshot'), arguments: z.object({}).strict() }),
  z.object({
    name: z.literal('click'),
    arguments: z
      .object({ x: z.number().int().min(0).max(1279), y: z.number().int().min(0).max(719) })
      .strict(),
  }),
  z.object({
    name: z.literal('type_text'),
    arguments: z.object({ text: z.string().min(1).max(8000) }).strict(),
  }),
  z.object({
    name: z.literal('press_key'),
    arguments: z
      .object({
        key: z
          .string()
          .regex(/^[A-Za-z0-9_+]+$/)
          .max(100),
      })
      .strict(),
  }),
  z.object({
    name: z.literal('execute'),
    arguments: z.object({ command: z.array(z.string().min(1).max(8192)).min(1).max(64) }).strict(),
  }),
]);

const resultSchema = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  outputTruncated: z.boolean().default(false),
});
const sessionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  status: z.string(),
  currentSandboxId: z.string().nullable().optional(),
});

export function actionCommand(action: ComputerAction): string[] {
  const parsed = actionSchema.parse(action);
  switch (parsed.name) {
    case 'screenshot':
      return [
        'python3',
        '-c',
        'import pyautogui,io,base64; b=io.BytesIO(); pyautogui.screenshot().save(b,format="PNG"); print(base64.b64encode(b.getvalue()).decode())',
      ];
    case 'click':
      return [
        'xdotool',
        'mousemove',
        String(parsed.arguments.x),
        String(parsed.arguments.y),
        'click',
        '1',
      ];
    case 'type_text':
      return ['xdotool', 'type', '--clearmodifiers', '--', parsed.arguments.text];
    case 'press_key':
      return ['xdotool', 'key', '--clearmodifiers', parsed.arguments.key];
    case 'execute':
      return parsed.arguments.command;
  }
}

export const computerSessionApi = {
  capabilities: async (signal: AbortSignal) =>
    sandboxCapabilitiesSchema.parse(
      await sandboxRequest('/api/v1/agent/sessions/capabilities', {
        method: 'GET',
        signal,
        timeoutMs: 10_000,
        maxRetries: 0,
        clearAuthOnUnauthorized: false,
      })
    ),
  create: async (chatId: string): Promise<ComputerSession> =>
    sessionSchema.parse(
      await sandboxRequest('/api/v1/agent/sessions', {
        method: 'POST',
        timeoutMs: 90_000,
        headers: { 'Idempotency-Key': `desktop-chat-${chatId}` },
        body: JSON.stringify({
          ...sandboxSessionConfiguration,
          clientId: `desktop-chat-${chatId}`,
        }),
      })
    ),
  get: async (id: string): Promise<ComputerSession> =>
    sessionSchema.parse(await sandboxRequest(`/api/v1/agent/sessions/${encodeURIComponent(id)}`)),
  sandboxStopped: async (id: string): Promise<boolean> => {
    try {
      const response = await sandboxRequest(`/api/v1/sandbox/${encodeURIComponent(id)}/status`, {
        timeoutMs: 5000,
        maxRetries: 0,
        clearAuthOnUnauthorized: false,
      });
      const result = z.object({ status: z.string() }).parse(response);
      return ['stopped', 'terminated', 'deleted'].includes(result.status);
    } catch (error) {
      if (error instanceof SandboxRequestError && error.status === 404) return true;
      throw error;
    }
  },
  start: async (id: string): Promise<ComputerSession> =>
    sessionSchema.parse(
      await sandboxRequest(`/api/v1/agent/sessions/${encodeURIComponent(id)}/start`, {
        method: 'POST',
        timeoutMs: 420_000,
      })
    ),
  stop: (id: string) =>
    sandboxRequest(`/api/v1/agent/sessions/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Stopped from desktop chat' }),
    }),
  stopSandbox: async (id: string): Promise<void> => {
    try {
      await sandboxRequest(`/api/v1/sandbox/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        timeoutMs: 30_000,
        headers: { 'Idempotency-Key': `desktop-cleanup-${id}` },
      });
    } catch (error) {
      if (!(error instanceof SandboxRequestError && error.status === 404)) throw error;
    }
  },
  execute: async (sessionId: string, pending: PendingAction): Promise<ActionResult> =>
    resultSchema.parse(
      await sandboxRequest(`/api/v1/agent/sessions/${encodeURIComponent(sessionId)}/exec`, {
        method: 'POST',
        timeoutMs: 60_000,
        headers: { 'Idempotency-Key': `desktop-action-${pending.requestId}` },
        body: JSON.stringify(execBody(pending)),
      })
    ),
  infer: async (sandboxId: string, body: unknown, signal: AbortSignal) => {
    try {
      return await sandboxRequest<{ content: ModelBlock[]; stop_reason?: string }>(
        `/api/v1/sandbox/${encodeURIComponent(sandboxId)}/inference`,
        {
          method: 'POST',
          signal,
          timeoutMs: 120_000,
          // This endpoint forwards provider status codes. A provider 401 does
          // not establish that the Sandbox API credential is invalid.
          clearAuthOnUnauthorized: false,
          authFallback: false,
          body: JSON.stringify({
            provider: 'anthropic',
            path: '/v1/messages',
            headers: { 'anthropic-version': '2023-06-01' },
            body,
          }),
        }
      );
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof SandboxRequestError) {
        const code =
          /(?:credit balance.*too low|insufficient.{0,20}credits?|credits?.{0,20}(?:exhausted|insufficient))/i.test(
            error.message
          )
            ? 'provider-credit'
            : [401, 403].includes(error.status)
              ? 'provider-auth'
              : error.status === 429
                ? 'provider-limit'
                : 'provider-unavailable';
        throw new ChatIssueError(code, error.message);
      }
      throw new ChatIssueError(
        'provider-unavailable',
        error instanceof Error ? error.message : 'Model request failed.'
      );
    }
  },
};

function execBody(pending: PendingAction) {
  return { command: pending.command, workingDir: '/workspace', timeoutMs: 30_000 };
}

export function workflowInput(chat: ComputerChat, pending: PendingAction) {
  if (!chat.session) throw new Error('This chat has no computer session.');
  return {
    brand_id: chat.brandId,
    request_id: pending.requestId,
    context: { desktop_chat_id: chat.id, sandbox_session_id: chat.session.id },
    steps: [
      {
        step_name: 'computer_action',
        connector_type: 'sandbox',
        direction: 'outbound',
        action: 'request',
        params: {
          method: 'POST',
          path: `/api/v1/agent/sessions/${encodeURIComponent(chat.session.id)}/exec`,
          headers: { 'Idempotency-Key': `desktop-action-${pending.requestId}` },
          body: execBody(pending),
        },
      },
    ],
  };
}

export const computerWorkflowApi = {
  start: (chat: ComputerChat, pending: PendingAction) =>
    engineRequest<{ workflow_id: string; run_id: string }>('/v1/workflows/connector/start', {
      method: 'POST',
      tenantId: chat.tenantId,
      body: workflowInput(chat, pending),
      signal: AbortSignal.timeout(60_000),
    }),
  status: async (tenantId: string, workflowId: string) => {
    const value = await engineRequest<{
      status: string;
      step_results: { computer_action?: { status_code: number; body: unknown } };
      failed_step?: string;
    }>(`/v1/workflows/connector/${encodeURIComponent(workflowId)}/status`, {
      tenantId,
      signal: AbortSignal.timeout(30_000),
    });
    const action = value.step_results.computer_action;
    if (action && (action.status_code < 200 || action.status_code >= 300))
      throw new Error(`Sandbox action returned HTTP ${action.status_code}.`);
    return { status: value.status, result: action ? resultSchema.parse(action.body) : undefined };
  },
  cancel: (tenantId: string, workflowId: string) =>
    engineRequest(`/v1/workflows/connector/${encodeURIComponent(workflowId)}/cancel`, {
      tenantId,
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    }),
};

/** Local configuration check only; never creates a decision or tests authorization. */
export async function requirePolicyKey(
  chat: Pick<ComputerChat, 'tenantId' | 'brandId'>
): Promise<string> {
  const credentials = await localSecretsApi.getCredentials(
    chat.tenantId,
    chat.brandId,
    POLICY_CONNECTION
  );
  const key = credentials?.api_key?.trim();
  if (!key)
    throw new ChatIssueError('policy-key', 'Save an NSR policy API key in Chat settings first.');
  return key;
}

export async function evaluateAction(
  chat: ComputerChat,
  action: ComputerAction,
  result?: ActionResult,
  context?: { signal: AbortSignal; assertCurrent: () => void }
): Promise<PolicyReceipt> {
  if (!chat.session?.currentSandboxId) throw new Error('The computer sandbox is unavailable.');
  const policyKey = await requirePolicyKey(chat);
  const command = actionCommand(action);
  const phase = result ? 'verification' : 'admission';
  const actor = `desktop-chat-${chat.id}`;
  const requestId = crypto.randomUUID();
  const actionHash = await evidenceDigest(
    JSON.stringify({
      organizationId: chat.session.organizationId,
      sessionId: chat.session.id,
      sandboxId: chat.session.currentSandboxId,
      actor,
      phase,
      action,
      command,
      requestId,
      observed: result
        ? { exitCode: result.exitCode, outputTruncated: result.outputTruncated }
        : null,
    })
  );
  const goal = { name: result ? 'can_accept_execution' : 'can_execute', args: [actor, actionHash] };
  const decision = await requestNsrDecision({
    scope: { tenantId: chat.tenantId, brandId: chat.brandId },
    ...context,
    apiKey: policyKey,
    organizationId: chat.session.organizationId,
    requestId,
    body: {
      query: `May this desktop chat ${result ? 'accept the execution observation' : 'execute the requested computer action'}?`,
      action: action.name,
      authorization_goal: goal,
      session_id: chat.session.id,
      external_ref: actionHash,
      hydrate_org_context: true,
      // Observations are supplied by the desktop, never an inline permission grant.
      // The organization's stored rules must authorize this exact call.
      facts: [
        decisionFact('requested_tool_call', actor, actionHash),
        decisionFact('call_tool', actionHash, action.name),
        decisionFact('call_resource', actionHash, chat.session.currentSandboxId),
        decisionFact('call_nonce', actionHash, requestId),
        decisionFact('call_session', actionHash, chat.session.id),
        decisionFact('call_phase', actionHash, phase),
        decisionFact('call_workspace', actionHash, '/workspace'),
        decisionFact(
          'call_command_sha256',
          actionHash,
          await evidenceDigest(JSON.stringify(command))
        ),
        decisionFact('call_executable', actionHash, command[0]),
        ...command
          .slice(1)
          .map((argument, index) =>
            decisionFact('call_argument_json', actionHash, index, JSON.stringify(argument))
          ),
        decisionFact(
          'call_gui_grounded',
          actionHash,
          action.name === 'screenshot' || Boolean(chat.screenshot)
        ),
        ...(result
          ? [
              decisionFact('execution_exit_code', actionHash, result.exitCode),
              decisionFact('execution_output_truncated', actionHash, result.outputTruncated),
            ]
          : []),
      ],
    },
  });
  return {
    source: 'decisions-v1',
    phase,
    verdict: decision.verdict,
    actionHash,
    evidenceIds: [decision.decisionId],
    reasons: [decision.reason],
    checkedAt: new Date().toISOString(),
  };
}

export interface ModelBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export const computerTools = [
  {
    name: 'screenshot',
    description:
      'Observe the current 1280x720 desktop. Take a screenshot before acting and after changing the screen.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'click',
    description: 'Left click a coordinate observed in the latest screenshot.',
    input_schema: {
      type: 'object',
      properties: { x: { type: 'integer' }, y: { type: 'integer' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type_text',
    description: 'Type literal text into the focused application.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'press_key',
    description: 'Press an X11 key or combination, e.g. Return, ctrl+l, Tab.',
    input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  },
  {
    name: 'execute',
    description:
      'Execute an argv array in /workspace in this chat computer. Observe stdout and exit code; do not assume success.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'array', items: { type: 'string' } } },
      required: ['command'],
    },
  },
];
