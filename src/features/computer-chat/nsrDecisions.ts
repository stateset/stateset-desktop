import { z } from 'zod';
import { desktopServiceFetch } from '../../lib/desktopServiceTransport';
import { ChatIssueError } from './chatIssue';

export const POLICY_API_URL = (
  import.meta.env.VITE_POLICY_API_URL || 'https://api.nsr.stateset.com'
).replace(/\/+$/, '');
export const POLICY_CONNECTION = 'computer-chat-policy';
export interface DecisionGoal {
  name: string;
  args: string[];
}
export function decisionFact(name: string, ...args: Array<string | boolean | number>) {
  // NSR deserializes ?-prefixed strings as variables, including in facts.
  if (args.some((value) => typeof value === 'string' && value.startsWith('?')))
    throw new Error('NSR observations must contain literal values, not policy variables.');
  return { predicate: { name, args }, confidence: 1, source: 'desktop_observation' };
}
export async function evidenceDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const decisionSchema = z.object({
  decision_id: z.string().min(1),
  decision: z.enum(['approved', 'denied', 'refused']),
  shadow: z.boolean(),
  routing: z.object({ band: z.enum(['act', 'confirm', 'escalate']) }),
  rationale: z.string(),
  verifiable_bundle: z.record(z.string(), z.unknown()).optional(),
});

/** Follow the Decisions API execution gate; a positive verdict alone is insufficient. */
export async function requestNsrDecision(options: {
  apiKey: string;
  organizationId: string;
  scope?: { tenantId: string; brandId: string };
  requestId: string;
  body: {
    query: string;
    action: string;
    authorization_goal: DecisionGoal;
    session_id: string;
    external_ref: string;
    facts: ReturnType<typeof decisionFact>[];
    rules?: unknown[];
    hydrate_org_context: boolean;
  };
  signal?: AbortSignal;
  assertCurrent?: () => void;
}) {
  for (const fact of options.body.facts) decisionFact(fact.predicate.name, ...fact.predicate.args);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
  const guard = () => {
    signal.throwIfAborted();
    options.assertCurrent?.();
  };
  const post = async (path: string, body: unknown, idempotent = false) => {
    guard();
    let response: Response;
    try {
      response = await desktopServiceFetch(
        'nsr',
        POLICY_API_URL,
        path,
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': options.apiKey,
            'X-Org-ID': options.organizationId,
            ...(idempotent ? { 'Idempotency-Key': `desktop-${options.requestId}` } : {}),
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: 30000, scope: options.scope }
      );
    } catch {
      // Caller cancellation and workspace changes retain their original meaning.
      guard();
      throw new ChatIssueError(
        'policy-unavailable',
        'The NSR request did not finish. No decision or proof was accepted from this response.'
      );
    }
    guard();
    if (!response.ok)
      throw new ChatIssueError(
        [401, 403].includes(response.status) ? 'policy-key' : 'policy-unavailable',
        `NSR decision check failed (HTTP ${response.status}).`
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      guard();
      throw new ChatIssueError(
        'policy-proof',
        'NSR returned an unreadable decision or proof response. No verification was accepted.'
      );
    }
    guard();
    return payload;
  };
  const parsedDecision = decisionSchema.safeParse(
    await post(
      '/v1/decisions',
      { ...options.body, mode: 'safe', include_trace: false, shadow: false },
      true
    )
  );
  if (!parsedDecision.success)
    throw new ChatIssueError(
      'policy-proof',
      'NSR returned an invalid decision response. No verification was accepted.'
    );
  const decision = parsedDecision.data;
  const approved = decision.decision === 'approved';
  if (!approved || decision.shadow || decision.routing.band !== 'act')
    return {
      decisionId: decision.decision_id,
      allowed: false,
      verdict: approved && !decision.shadow ? ('ask_user' as const) : ('deny' as const),
      reason: decision.shadow
        ? 'NSR returned a shadow decision; it cannot authorize this check.'
        : decision.rationale,
    };

  const bundle = decision.verifiable_bundle;
  const fail = () =>
    new ChatIssueError(
      'policy-proof',
      'The verification receipt does not match this file and request or action.'
    );
  if (!bundle || bundle.org_id !== options.organizationId) throw fail();
  const parsedProof = z
    .object({
      goal: z.object({
        predicate: z.string(),
        terms: z.array(z.unknown()),
        negated: z.boolean().optional(),
      }),
    })
    .safeParse(bundle.proof);
  if (!parsedProof.success) throw fail();
  const goal = parsedProof.data.goal;
  const expected = options.body.authorization_goal;
  const termValue = (term: unknown) => {
    const parsed = z.record(z.string(), z.unknown()).safeParse(term);
    if (!parsed.success || Object.keys(parsed.data).length !== 1) return undefined;
    return parsed.data.Constant ?? parsed.data.EntityRef;
  };
  if (
    goal.negated ||
    goal.predicate !== expected.name ||
    goal.terms.length !== expected.args.length
  )
    throw fail();
  if (bundle.goal_binding != null) {
    const parsedBinding = z
      .object({ version: z.literal(1), registry: z.string().min(1), args: z.array(z.string()) })
      .strict()
      .safeParse(bundle.goal_binding);
    if (!parsedBinding.success) throw fail();
    const binding = parsedBinding.data;
    if (
      JSON.stringify(binding.args) !== JSON.stringify(expected.args) ||
      !goal.terms.every((term) => typeof termValue(term) === 'string')
    )
      throw fail();
  } else if (!goal.terms.every((term, index) => termValue(term) === expected.args[index]))
    throw fail();
  const parsedVerification = z
    .object({ verified: z.boolean(), goal_binding_verified: z.boolean().optional() })
    .safeParse(await post('/v1/proofs/verify', bundle));
  if (!parsedVerification.success)
    throw new ChatIssueError(
      'policy-proof',
      'NSR returned an invalid proof verification response. No verification was accepted.'
    );
  const verification = parsedVerification.data;
  if (
    !verification.verified ||
    (bundle.goal_binding != null && verification.goal_binding_verified !== true)
  )
    throw new ChatIssueError('policy-proof', 'NSR could not verify the decision proof.');
  guard();
  return {
    decisionId: decision.decision_id,
    allowed: true,
    verdict: 'allow' as const,
    reason: decision.rationale,
  };
}
