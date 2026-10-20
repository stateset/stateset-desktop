import { z } from 'zod';
import { desktopServiceFetch } from '../../lib/desktopServiceTransport';

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
    const response = await desktopServiceFetch(
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
    guard();
    if (!response.ok) throw new Error(`NSR decision check failed (HTTP ${response.status}).`);
    const payload: unknown = await response.json();
    guard();
    return payload;
  };
  const decision = decisionSchema.parse(
    await post(
      '/v1/decisions',
      { ...options.body, mode: 'safe', include_trace: false, shadow: false },
      true
    )
  );
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
    new Error('The verification receipt does not match this file and request or action.');
  if (!bundle || bundle.org_id !== options.organizationId) throw fail();
  const goal = z
    .object({ predicate: z.string(), terms: z.array(z.unknown()), negated: z.boolean().optional() })
    .parse(z.object({ goal: z.unknown() }).parse(bundle.proof).goal);
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
    const binding = z
      .object({ version: z.literal(1), registry: z.string().min(1), args: z.array(z.string()) })
      .strict()
      .parse(bundle.goal_binding);
    if (
      JSON.stringify(binding.args) !== JSON.stringify(expected.args) ||
      !goal.terms.every((term) => typeof termValue(term) === 'string')
    )
      throw fail();
  } else if (!goal.terms.every((term, index) => termValue(term) === expected.args[index]))
    throw fail();
  const verification = z
    .object({ verified: z.boolean(), goal_binding_verified: z.boolean().optional() })
    .parse(await post('/v1/proofs/verify', bundle));
  if (
    !verification.verified ||
    (bundle.goal_binding != null && verification.goal_binding_verified !== true)
  )
    throw new Error('NSR could not verify the decision proof.');
  guard();
  return {
    decisionId: decision.decision_id,
    allowed: true,
    verdict: 'allow' as const,
    reason: decision.rationale,
  };
}
