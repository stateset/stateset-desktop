/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decisionFact, requestNsrDecision } from './nsrDecisions';

const goal = { name: 'can_execute', args: ['desktop-chat-1', 'bound-call'] };
const options = {
  apiKey: 'private-key',
  organizationId: 'org',
  requestId: 'request',
  body: {
    query: 'May this exact call execute?',
    action: 'execute',
    authorization_goal: goal,
    session_id: 'session',
    external_ref: 'bound-call',
    facts: [],
    hydrate_org_context: true,
  },
};
const bundle = () => ({
  org_id: 'org',
  facts: [],
  rules: [],
  proof: {
    goal: {
      predicate: goal.name,
      terms: goal.args.map((value) => ({ Constant: value })),
    },
  },
});
const approval = () => ({
  decision_id: 'decision-1',
  decision: 'approved',
  shadow: false,
  routing: { band: 'act' },
  rationale: 'Declared policy allows the call.',
  verifiable_bundle: bundle(),
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).endsWith('/v1/proofs/verify') ? { verified: true } : approval()
            )
          )
      )
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(['?role', '?', '?x with spaces'])(
  'rejects an ungrounded observation %j before submission',
  (value) => {
    expect(() => decisionFact('call_resource', 'call', value)).toThrow('literal values');
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('replays the exact decision bundle and binds organization, goal and idempotency', async () => {
  expect(await requestNsrDecision(options)).toMatchObject({
    allowed: true,
    verdict: 'allow',
    decisionId: 'decision-1',
  });
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls[0][0]).toBe('https://api.nsr.stateset.com/v1/decisions');
  expect(calls[0][1]).toMatchObject({
    redirect: 'error',
    headers: {
      'X-API-Key': 'private-key',
      'X-Org-ID': 'org',
      'Idempotency-Key': 'desktop-request',
    },
  });
  expect(JSON.parse(calls[0][1]!.body as string)).toMatchObject({
    ...options.body,
    mode: 'safe',
    shadow: false,
  });
  expect(calls[1][0]).toBe('https://api.nsr.stateset.com/v1/proofs/verify');
  expect(JSON.parse(calls[1][1]!.body as string)).toEqual(bundle());
});
it.each([401, 403, 503])(
  'retains NSR failure provenance for recovery guidance (HTTP %s)',
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status }));
    await expect(requestNsrDecision(options)).rejects.toMatchObject({
      code: status === 503 ? 'policy-unavailable' : 'policy-key',
    });
    expect(fetch).toHaveBeenCalledOnce();
  }
);
it('marks a foreign proof as a verification failure without sending it for replay', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({ ...approval(), verifiable_bundle: { ...bundle(), org_id: 'other-org' } })
    )
  );
  await expect(requestNsrDecision(options)).rejects.toMatchObject({ code: 'policy-proof' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('rejects raw variable-valued facts at the request boundary', async () => {
  await expect(
    requestNsrDecision({
      ...options,
      body: {
        ...options.body,
        facts: [
          {
            predicate: { name: 'call_resource', args: ['bound-call', '?any_resource'] },
            confidence: 1,
            source: 'desktop_observation',
          },
        ],
      },
    })
  ).rejects.toThrow('literal values');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ['denied', false, 'act', 'deny'],
  ['refused', false, 'escalate', 'deny'],
  ['approved', true, 'act', 'deny'],
  ['approved', false, 'confirm', 'ask_user'],
  ['approved', false, 'escalate', 'ask_user'],
])(
  'blocks %s shadow=%s routing=%s before proof replay',
  async (decision, shadow, band, verdict) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...approval(), decision, shadow, routing: { band } }))
    );
    expect(await requestNsrDecision(options)).toMatchObject({ allowed: false, verdict });
    expect(fetch).toHaveBeenCalledOnce();
  }
);

it.each([
  'missing_shadow',
  'missing_routing',
  'unknown_verdict',
  'missing_bundle',
  'other_org',
  'wrong_goal',
  'wrong_argument',
  'negated_goal',
  'invalid_proof',
  'missing_typed_confirmation',
])('fails closed on %s', async (fault) => {
  const result: Record<string, unknown> = approval();
  const proof = bundle();
  result.verifiable_bundle = proof;
  if (fault === 'missing_shadow') delete result.shadow;
  if (fault === 'missing_routing') delete result.routing;
  if (fault === 'unknown_verdict') result.decision = 'allow';
  if (fault === 'missing_bundle') delete result.verifiable_bundle;
  if (fault === 'other_org') proof.org_id = 'other';
  if (fault === 'wrong_goal') proof.proof.goal.predicate = 'different';
  if (fault === 'wrong_argument') proof.proof.goal.terms[1] = { Constant: 'different' };
  if (fault === 'negated_goal') Object.assign(proof.proof.goal, { negated: true });
  if (fault === 'missing_typed_confirmation')
    Object.assign(proof, { goal_binding: { version: 1, registry: 'r', args: goal.args } });
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/v1/proofs/verify')
            ? { verified: fault !== 'invalid_proof' }
            : result
        )
      )
  );
  await expect(requestNsrDecision(options)).rejects.toThrow();
});

it('requires the verifier to confirm typed aliases, preserving the bundle verbatim', async () => {
  const result = approval();
  Object.assign(result.verifiable_bundle, {
    goal_binding: { version: 1, registry: 'r', args: goal.args },
  });
  result.verifiable_bundle.proof.goal.terms = [{ Constant: 'alias-1' }, { Constant: 'alias-2' }];
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/v1/proofs/verify')
            ? { verified: true, goal_binding_verified: true }
            : result
        )
      )
  );
  expect((await requestNsrDecision(options)).allowed).toBe(true);
});

it('does not replay a billed decision automatically or expose a server error body', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('private provider details', { status: 503 }));
  await expect(requestNsrDecision(options)).rejects.toThrow(
    'NSR decision check failed (HTTP 503).'
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it('discards a decision when the caller cancels or changes context', async () => {
  const controller = new AbortController();
  vi.mocked(fetch).mockImplementation(async () => {
    controller.abort(new Error('Cancelled'));
    return new Response(JSON.stringify(approval()));
  });
  await expect(requestNsrDecision({ ...options, signal: controller.signal })).rejects.toThrow(
    'Cancelled'
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(['decision', 'proof'] as const)(
  'classifies a transport failure during %s without replaying a decision or exposing transport details',
  async (phase) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (phase === 'decision' || String(url).endsWith('/v1/proofs/verify'))
        throw new Error('private transport details');
      return new Response(JSON.stringify(approval()));
    });
    const task = requestNsrDecision(options);
    await expect(task).rejects.toMatchObject({ code: 'policy-unavailable' });
    await expect(task).rejects.not.toThrow('private transport details');
    expect(fetch).toHaveBeenCalledTimes(phase === 'decision' ? 1 : 2);
  }
);

it.each(['json', 'decision', 'proof', 'binding', 'verification'] as const)(
  'rejects malformed %s with typed verification guidance and no server payload preview',
  async (fault) => {
    const result: Record<string, unknown> = approval();
    if (fault === 'decision') result.shadow = 'private response data';
    if (fault === 'proof')
      Object.assign(result.verifiable_bundle as object, { proof: 'private response data' });
    if (fault === 'binding')
      Object.assign(result.verifiable_bundle as object, {
        goal_binding: { version: 2, args: ['private response data'] },
      });
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (fault === 'json') return new Response('private response data');
      return new Response(
        JSON.stringify(
          String(url).endsWith('/v1/proofs/verify') ? { verified: 'private response data' } : result
        )
      );
    });
    const task = requestNsrDecision(options);
    await expect(task).rejects.toMatchObject({ code: 'policy-proof' });
    await expect(task).rejects.not.toThrow('private response data');
    expect(fetch).toHaveBeenCalledTimes(fault === 'verification' ? 2 : 1);
  }
);

it.each(['cancelled', 'workspace changed'] as const)(
  'preserves caller ownership when transport fails after %s',
  async (reason) => {
    const controller = new AbortController();
    let changed = false;
    vi.mocked(fetch).mockImplementation(async () => {
      if (reason === 'cancelled') controller.abort(new Error(reason));
      else changed = true;
      throw new Error('private transport details');
    });
    await expect(
      requestNsrDecision({
        ...options,
        signal: controller.signal,
        assertCurrent: () => {
          if (changed) throw new Error(reason);
        },
      })
    ).rejects.toThrow(reason);
    expect(fetch).toHaveBeenCalledOnce();
  }
);
