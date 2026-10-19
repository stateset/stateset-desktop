/** @vitest-environment happy-dom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionCommand,
  actionSchema,
  computerSessionApi,
  evaluateAction,
  workflowInput,
} from './api';
import { useAuthStore } from '../../stores/auth';
import { localSecretsApi } from '../../lib/localSecrets';
import type { ComputerChat, PendingAction } from './types';

const chat: ComputerChat = {
  id: 'chat',
  tenantId: 'tenant',
  brandId: 'brand',
  title: 'Chat',
  createdAt: '',
  updatedAt: '',
  messages: [],
  workflows: [],
  session: {
    id: 'session-1',
    organizationId: 'sandbox-org',
    currentSandboxId: 'sandbox-1',
    status: 'running',
  },
};

beforeEach(() => {
  useAuthStore.setState({ sandboxApiKey: 'sandbox-key' });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('computer service contracts', () => {
  it('confirms sandbox disappearance but never treats a permission error as cleanup', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(computerSessionApi.sandboxStopped('sandbox-1')).resolves.toBe(true);
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 403 }));
    await expect(computerSessionApi.sandboxStopped('sandbox-1')).rejects.toThrow();
  });
  it('creates the desktop template with stable idempotency and bounded budgets', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(chat.session)));
    await computerSessionApi.create('chat-1');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/agent\/sessions$/);
    expect(init?.headers).toMatchObject({
      'Idempotency-Key': 'desktop-chat-chat-1',
      Authorization: 'ApiKey sandbox-key',
    });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      sandbox: {
        template: 'computer-use',
        isolation: 'gvisor',
        durable: false,
        timeoutSeconds: 3600,
      },
      budget: { iterationLimit: 500 },
    });
  });

  it('passes text as literal argv without shell expansion', () => {
    const text = '$(touch /tmp/unwanted) --help `echo test`';
    expect(actionCommand({ name: 'type_text', arguments: { text } })).toEqual([
      'xdotool',
      'type',
      '--clearmodifiers',
      '--',
      text,
    ]);
    expect(() => actionSchema.parse({ name: 'click', arguments: { x: -1, y: 10 } })).toThrow();
    expect(() =>
      actionSchema.parse({ name: 'press_key', arguments: { key: 'Return; echo secret' } })
    ).toThrow();
    expect(() => actionSchema.parse({ name: 'execute', arguments: { command: [] } })).toThrow();
  });

  it('targets this chat’s session through a sandbox connector without embedding credentials', () => {
    const pending: PendingAction = {
      requestId: 'request',
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      command: ['pwd'],
      durable: true,
      verify: true,
    };
    const payload = workflowInput(chat, pending);
    expect(payload).toMatchObject({
      brand_id: 'brand',
      request_id: 'request',
      steps: [
        {
          connector_type: 'sandbox',
          action: 'request',
          params: {
            path: '/api/v1/agent/sessions/session-1/exec',
            headers: { 'Idempotency-Key': 'desktop-action-request' },
            body: { command: ['pwd'], timeoutMs: 30000 },
          },
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('sandbox-key');
  });

  it('verifies using the sandbox organization and actual execution observations', async () => {
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue({ api_key: 'policy-key' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          final_verdict: 'deny',
          evidence_ids: ['proof'],
          evaluation: {
            canonical_action_hash: 'hash',
            triggered_rules: [{ reason: 'Nonzero exit' }],
          },
        })
      )
    );
    const receipt = await evaluateAction(
      chat,
      { name: 'execute', arguments: { command: ['false'] } },
      { exitCode: 1, stdout: 'not sent to policy', stderr: '', outputTruncated: true }
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/policy\/sandbox\/evaluate$/);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer policy-key' });
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      org_id: 'sandbox-org',
      phase: 'verification',
      sandbox_id: 'sandbox-1',
      observed: { exit_code: 1, output_truncated: true },
    });
    expect(JSON.stringify(body)).not.toContain('not sent to policy');
    expect(receipt).toMatchObject({
      phase: 'verification',
      verdict: 'deny',
      evidenceIds: ['proof'],
    });
  });

  it('fails closed on malformed policy responses', async () => {
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue({ api_key: 'policy-key' });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ final_verdict: 'allow' })));
    await expect(evaluateAction(chat, { name: 'screenshot', arguments: {} })).rejects.toThrow();
  });
});
