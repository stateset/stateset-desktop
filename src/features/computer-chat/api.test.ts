/** @vitest-environment happy-dom */
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionCommand,
  actionSchema,
  computerSessionApi,
  evaluateAction,
  requirePolicyKey,
  POLICY_CONNECTION,
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
  vi.stubGlobal('crypto', webcrypto);
  useAuthStore.setState({ sandboxApiKey: 'sandbox-key' });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('computer service contracts', () => {
  it('reads and validates capabilities without allocating compute or clearing a rejected saved key', async () => {
    const clear = vi.spyOn(useAuthStore.getState(), 'clearSandboxApiKey');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          organization_id: 'sandbox-org',
          computer_use: true,
          inference_ready: false,
          workspace_evidence: true,
          max_artifact_bytes: 131072,
        })
      )
    );
    const signal = new AbortController().signal;
    expect(await computerSessionApi.capabilities(signal)).toMatchObject({
      inference_ready: false,
      computer_use: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/agent/sessions/capabilities'),
      expect.objectContaining({ method: 'GET' })
    );
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(computerSessionApi.capabilities(signal)).rejects.toThrow();
    expect(clear).not.toHaveBeenCalled();
    expect(useAuthStore.getState().sandboxApiKey).toBe('sandbox-key');
  });
  it('rejects incomplete capabilities instead of promoting an HTTP success to readiness', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: 1, computer_use: true }))
    );
    await expect(computerSessionApi.capabilities(new AbortController().signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    {
      status: 400,
      message: 'Your credit balance is too low to access the Anthropic API.',
      code: 'provider-credit',
    },
    { status: 402, message: 'Insufficient credits', code: 'provider-credit' },
    { status: 401, message: 'Provider access rejected', code: 'provider-auth' },
    { status: 403, message: 'Provider access denied', code: 'provider-auth' },
    { status: 429, message: 'Rate limited', code: 'provider-limit' },
    { status: 502, message: 'Upstream failed', code: 'provider-unavailable' },
  ])(
    'retains model failure provenance ($code) without replay or credential removal',
    async ({ status, message, code }) => {
      const clear = vi.spyOn(useAuthStore.getState(), 'clearSandboxApiKey');
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: message }), { status })
      );
      await expect(
        computerSessionApi.infer('sandbox-1', {}, new AbortController().signal)
      ).rejects.toMatchObject({ code, message });
      expect(fetch).toHaveBeenCalledOnce();
      expect(clear).not.toHaveBeenCalled();
      expect(useAuthStore.getState().sandboxApiKey).toBe('sandbox-key');
    }
  );
  it.each([null, { api_key: '' }, { api_key: '   ' }])(
    'rejects missing policy credentials %j without making requests',
    async (credentials) => {
      vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue(credentials);
      await expect(requirePolicyKey(chat)).rejects.toThrow('Save an NSR policy API key');
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('checks the scoped saved credential without claiming authorization', async () => {
    const read = vi
      .spyOn(localSecretsApi, 'getCredentials')
      .mockResolvedValue({ api_key: ' policy-key ' });
    expect(await requirePolicyKey(chat)).toBe('policy-key');
    expect(read).toHaveBeenCalledWith('tenant', 'brand', POLICY_CONNECTION);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stops only the retained computer and tolerates disappearance without hiding permission failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(computerSessionApi.stopSandbox('owned-id')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sandbox/owned-id/stop'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'desktop-cleanup-owned-id' }),
      })
    );
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 403 }));
    await expect(computerSessionApi.stopSandbox('owned-id')).rejects.toThrow();
  });
  it('does not discard Sandbox credentials or replay inference when the provider rejects its key', async () => {
    const clear = vi.spyOn(useAuthStore.getState(), 'clearSandboxApiKey');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Provider key rejected' } }), { status: 401 })
    );
    await expect(
      computerSessionApi.infer('sandbox-1', {}, new AbortController().signal)
    ).rejects.toThrow('Provider key rejected');
    expect(fetch).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(useAuthStore.getState().sandboxApiKey).toBe('sandbox-key');
  });
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
          decision_id: 'proof',
          decision: 'denied',
          shadow: false,
          routing: { band: 'escalate' },
          rationale: 'Nonzero exit',
        })
      )
    );
    const receipt = await evaluateAction(
      chat,
      { name: 'execute', arguments: { command: ['false'] } },
      { exitCode: 1, stdout: 'not sent to policy', stderr: '', outputTruncated: true }
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.nsr.stateset.com/v1/decisions');
    expect(init?.headers).toMatchObject({
      'X-API-Key': 'policy-key',
      'X-Org-ID': 'sandbox-org',
      'Idempotency-Key': expect.stringMatching(/^desktop-/),
    });
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      session_id: 'session-1',
      action: 'execute',
      mode: 'safe',
      shadow: false,
      hydrate_org_context: true,
      authorization_goal: {
        name: 'can_accept_execution',
        args: ['desktop-chat-chat', expect.any(String)],
      },
    });
    expect(body.rules).toBeUndefined();
    expect(body.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: { name: 'execution_exit_code', args: [body.external_ref, 1] },
        }),
        expect.objectContaining({
          predicate: { name: 'execution_output_truncated', args: [body.external_ref, true] },
        }),
      ])
    );
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

  it('encodes question-prefixed command arguments as literals instead of NSR variables', async () => {
    vi.spyOn(localSecretsApi, 'getCredentials').mockResolvedValue({ api_key: 'policy-key' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          decision_id: 'decision',
          decision: 'refused',
          shadow: false,
          routing: { band: 'escalate' },
          rationale: 'No permission',
        })
      )
    );
    await evaluateAction(chat, { name: 'execute', arguments: { command: ['printf', '?role'] } });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: { name: 'call_argument_json', args: [body.external_ref, 0, '"?role"'] },
        }),
      ])
    );
    expect(
      body.facts.every((fact: { predicate: { args: unknown[] } }) =>
        fact.predicate.args.every((arg) => typeof arg !== 'string' || !arg.startsWith('?'))
      )
    ).toBe(true);
  });
});
