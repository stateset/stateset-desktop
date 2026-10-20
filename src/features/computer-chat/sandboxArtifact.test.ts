/** @vitest-environment happy-dom */
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localSecretsApi } from '../../lib/localSecrets';
import { sandboxRequest } from '../../lib/sandbox';
import { checkSandboxArtifact, fileCheckCriterion } from './sandboxArtifact';
import type { ComputerChat } from './types';

vi.mock('../../lib/localSecrets', () => ({ localSecretsApi: { getCredentials: vi.fn() } }));
vi.mock('../../lib/sandbox', async (original) => ({
  ...(await original<typeof import('../../lib/sandbox')>()),
  sandboxRequest: vi.fn(),
}));
const chat: ComputerChat = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant',
  brandId: 'brand',
  title: 'File check',
  createdAt: '',
  updatedAt: '',
  messages: [],
  workflows: [],
  sandboxApiSession: { version: 1 },
  session: {
    id: 'session',
    organizationId: 'org',
    status: 'running',
    currentSandboxId: 'computer',
  },
};
const input = { path: '/workspace/report.txt', kind: 'contains' as const, expected: 'proof' };
const file = () => {
  const bytes = Buffer.from('exact proof bytes');
  return {
    path: input.path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.length,
    media_type: 'text/plain',
    content_base64: bytes.toString('base64'),
  };
};
interface EvidenceBody {
  session_id: string;
  authorization_goal: { name: string; args: string[] };
  facts: Array<{ predicate: { args: unknown[] } }>;
}
function receipt(body: EvidenceBody, passed = true) {
  return {
    decision_id: 'decision-1',
    decision: passed ? 'approved' : 'refused',
    shadow: false,
    routing: { band: passed ? 'act' : 'escalate' },
    rationale: 'Explicit byte check',
    ...(passed
      ? {
          verifiable_bundle: {
            org_id: 'org',
            facts: [],
            rules: [],
            proof: {
              goal: {
                predicate: body.authorization_goal.name,
                terms: body.authorization_goal.args.map((value) => ({ Constant: value })),
              },
            },
          },
        }
      : {}),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(localSecretsApi.getCredentials).mockResolvedValue({ api_key: 'nsr-secret' });
  vi.mocked(sandboxRequest).mockResolvedValue(file());
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async (url, init) =>
          new Response(
            JSON.stringify(
              String(url).endsWith('/v1/proofs/verify')
                ? { verified: true }
                : receipt(JSON.parse(init.body))
            )
          )
      )
  );
});
afterEach(() => vi.unstubAllGlobals());
const check = (signal = new AbortController().signal, guard: () => void = vi.fn()) =>
  checkSandboxArtifact(chat, input, signal, guard);

it('checks collected bytes locally and sends only bound observations to Decisions with redirect protection', async () => {
  const result = await check();
  expect(sandboxRequest).toHaveBeenCalledWith(
    '/api/v1/agent/sessions/session/workspace/read',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: input.path }) })
  );
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe('https://api.nsr.stateset.com/v1/decisions');
  expect(init).toMatchObject({
    method: 'POST',
    redirect: 'error',
    headers: {
      'X-API-Key': 'nsr-secret',
      'X-Org-ID': 'org',
      'Content-Type': 'application/json',
      'Idempotency-Key': `desktop-${result.requestId}`,
    },
  });
  const body = JSON.parse(init!.body as string);
  expect(body).toMatchObject({
    session_id: 'session',
    hydrate_org_context: false,
    authorization_goal: { name: 'desktop_file_check', args: ['session', expect.any(String)] },
    facts: [
      {
        predicate: {
          name: 'desktop_file_observation',
          args: ['session', expect.any(String), true],
        },
      },
    ],
    rules: [{ effect: 'permit' }],
  });
  expect(JSON.stringify(body)).not.toContain(file().content_base64);
  expect(JSON.stringify(body)).not.toContain('exact proof bytes');
  expect(JSON.stringify(body)).not.toContain('"expected"');
  expect(JSON.stringify(body)).not.toContain('"proof"');
  expect(vi.mocked(fetch).mock.calls[1][0]).toBe('https://api.nsr.stateset.com/v1/proofs/verify');
  expect(result.verification.verified).toBe(true);
  expect(JSON.stringify(result)).not.toContain('exact proof bytes');
  expect(JSON.stringify(result)).not.toContain(file().content_base64);
  expect(JSON.stringify(result)).not.toContain('nsr-secret');
});

it.each([
  '/workspace/../secret',
  '/etc/passwd',
  '/workspace/report\n.txt',
  '/workspace/report\\.txt',
  '/workspace/',
])('refuses unsafe file path %j without reading it', async (path) => {
  await expect(
    checkSandboxArtifact(chat, { ...input, path }, new AbortController().signal, vi.fn())
  ).rejects.toThrow();
  expect(sandboxRequest).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('validates digest and expected-value limits without changing exact-text expectations', () => {
  expect(fileCheckCriterion({ ...input, kind: 'equals', expected: '' }).expected).toBe('');
  expect(fileCheckCriterion({ ...input, kind: 'equals', expected: ' proof\n' }).expected).toBe(
    ' proof\n'
  );
  expect(() => fileCheckCriterion({ ...input, kind: 'sha256', expected: 'bad' })).toThrow(
    'SHA-256'
  );
  expect(() => fileCheckCriterion({ ...input, expected: '\u0001'.repeat(3000) })).toThrow('16,384');
});

it.each([
  { sha256: '0'.repeat(64) },
  { path: '/workspace/other.txt' },
  { size_bytes: 131073 },
  { content_base64: '!!!' },
])('refuses altered or oversized sandbox evidence %j before contacting NSR', async (patch) => {
  vi.mocked(sandboxRequest).mockResolvedValue({ ...file(), ...patch });
  await expect(check()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['wrong_goal', 'wrong_org', 'missing_bundle', 'invalid_proof'])(
  'refuses an NSR approval with %s',
  async (fault) => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/v1/proofs/verify'))
        return new Response(JSON.stringify({ verified: false }));
      const result = receipt(JSON.parse(init!.body as string));
      if (fault === 'wrong_goal')
        result.verifiable_bundle!.proof.goal.terms[1] = { Constant: 'unrelated' };
      if (fault === 'wrong_org') result.verifiable_bundle!.org_id = 'other';
      if (fault === 'missing_bundle') delete result.verifiable_bundle;
      return new Response(JSON.stringify(result));
    });
    await expect(check()).rejects.toThrow();
  }
);

it('retains failed acceptance as a failed receipt rather than promoting it to verified', async () => {
  vi.mocked(fetch).mockImplementation(
    async (_url, init) =>
      new Response(JSON.stringify(receipt(JSON.parse(init!.body as string), false)))
  );
  expect((await check()).verification).toMatchObject({ outcome: 'failed', verified: false });
});

it.each([null, { api_key: '' }, { api_key: '   ' }])(
  'requires the separately scoped policy credential before collecting bytes (%j)',
  async (credentials) => {
    vi.mocked(localSecretsApi.getCredentials).mockResolvedValue(credentials);
    await expect(check()).rejects.toMatchObject({
      code: 'policy-key',
      message: expect.stringContaining('NSR policy API key'),
    });
    expect(sandboxRequest).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('discards obsolete context before sending collected bytes to NSR', async () => {
  let changed = false;
  vi.mocked(sandboxRequest).mockImplementation(async () => {
    changed = true;
    return file();
  });
  await expect(
    check(new AbortController().signal, () => {
      if (changed) throw new Error('Connection changed');
    })
  ).rejects.toThrow('Connection changed');
  expect(fetch).not.toHaveBeenCalled();
});

it('does not accept a receipt after cancellation', async () => {
  const controller = new AbortController();
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    controller.abort(new DOMException('Paused', 'AbortError'));
    return new Response(JSON.stringify(receipt(JSON.parse(init!.body as string))));
  });
  await expect(check(controller.signal)).rejects.toThrow('Paused');
});

it.each([
  ['contains', 'missing', false],
  ['equals', 'exact proof bytes', true],
  ['equals', 'exact proof bytes\n', false],
  ['sha256', file().sha256, true],
  ['sha256', '0'.repeat(64), false],
] as const)('compares %s deterministically', async (kind, expected, matched) => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith('/v1/proofs/verify'))
      return new Response(JSON.stringify({ verified: true }));
    const body = JSON.parse(init!.body as string);
    expect(body.facts[0].predicate.args[2]).toBe(matched);
    return new Response(JSON.stringify(receipt(body, matched)));
  });
  const result = await checkSandboxArtifact(
    chat,
    { ...input, kind, expected },
    new AbortController().signal,
    vi.fn()
  );
  expect(result.verification.verified).toBe(matched);
});

it('preserves the UTF-8 byte order mark in exact text checks', async () => {
  const bytes = Buffer.from('\ufeffexact proof bytes');
  vi.mocked(sandboxRequest).mockResolvedValue({
    ...file(),
    content_base64: bytes.toString('base64'),
    size_bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body.facts[0].predicate.args[2]).toBe(false);
    return new Response(JSON.stringify(receipt(body, false)));
  });
  const result = await checkSandboxArtifact(
    chat,
    { ...input, kind: 'equals', expected: 'exact proof bytes' },
    new AbortController().signal,
    vi.fn()
  );
  expect(result.verification.verified).toBe(false);
});

it('refuses malformed UTF-8 text before submitting a decision', async () => {
  const bytes = Buffer.from([255, 254]);
  vi.mocked(sandboxRequest).mockResolvedValue({
    ...file(),
    content_base64: bytes.toString('base64'),
    size_bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await expect(check()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
