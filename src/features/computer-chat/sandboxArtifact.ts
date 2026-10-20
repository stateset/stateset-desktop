import { z } from 'zod';
import { sandboxRequest } from '../../lib/sandbox';
import { localSecretsApi } from '../../lib/localSecrets';
import {
  POLICY_CONNECTION,
  decisionFact,
  evidenceDigest,
  requestNsrDecision,
} from './nsrDecisions';
export { evidenceDigest } from './nsrDecisions';
import { artifactSchema } from './durableTypes';
import { decodeArtifactContent, workspaceDirectory } from './artifacts';
import type { ComputerChat } from './types';

export type FileCheckKind = 'contains' | 'equals' | 'sha256';
export interface FileCheckInput {
  path: string;
  kind: FileCheckKind;
  expected: string;
}
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const verificationSchema = z.object({
  verified: z.boolean(),
  outcome: z.enum(['verified', 'failed']),
  manifest_sha256: digestSchema,
  checks: z
    .array(
      z.object({
        path: z.string(),
        kind: z.enum(['contains', 'equals', 'sha256']),
        passed: z.boolean(),
        detail: z.string(),
        sha256: digestSchema,
      })
    )
    .length(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
});
export const sandboxArtifactReceiptSchema = z.object({
  requestId: z.uuid(),
  sessionId: z.string().min(1),
  sandboxId: z.string().min(1),
  organizationId: z.string().min(1),
  checkedAt: z.string(),
  path: z.string(),
  sha256: digestSchema,
  sizeBytes: z.number().int().min(0).max(131072),
  kind: z.enum(['contains', 'equals', 'sha256']),
  criterionSha256: digestSchema,
  verification: verificationSchema,
  outdated: z.boolean().optional(),
  decisionId: z.string().min(1).optional(),
  source: z.literal('decisions-v1').optional(),
  observationMatched: z.boolean().optional(),
});
export type SandboxArtifactReceipt = z.infer<typeof sandboxArtifactReceiptSchema>;

export function fileCheckCriterion(input: FileCheckInput) {
  if (input.path.endsWith('/')) throw new Error('Choose a file under /workspace.');
  const path = workspaceDirectory(input.path);
  if (path === '/workspace') throw new Error('Choose a file under /workspace.');
  if (!['contains', 'equals', 'sha256'].includes(input.kind))
    throw new Error('Choose a supported file check.');
  const expected = input.kind === 'sha256' ? input.expected.trim().toLowerCase() : input.expected;
  if (input.kind === 'contains' && !expected.length)
    throw new Error('Enter the text the file must contain.');
  if (input.kind === 'sha256' && !/^[a-f0-9]{64}$/.test(expected))
    throw new Error('Enter a 64-character SHA-256 digest.');
  if (new TextEncoder().encode(JSON.stringify(expected)).byteLength > 16384)
    throw new Error('Expected values can use at most 16,384 JSON-encoded bytes.');
  return { path, kind: input.kind, expected };
}

/** Verify exact bytes read by the controller; model descriptions are never evidence. */
export async function checkSandboxArtifact(
  chat: ComputerChat,
  input: FileCheckInput,
  signal: AbortSignal,
  assertCurrent: () => void
): Promise<SandboxArtifactReceipt> {
  const criterion = fileCheckCriterion(input);
  const session = chat.session;
  if (!session?.currentSandboxId || session.status !== 'running')
    throw new Error('The computer must be running to collect and check a file.');
  const guard = () => {
    signal.throwIfAborted();
    assertCurrent();
  };
  guard();
  const credentials = await localSecretsApi.getCredentials(
    chat.tenantId,
    chat.brandId,
    POLICY_CONNECTION
  );
  guard();
  if (!credentials?.api_key) throw new Error('Save an NSR policy API key in Chat settings first.');
  const artifact = artifactSchema.parse(
    await sandboxRequest(
      `/api/v1/agent/sessions/${encodeURIComponent(session.id)}/workspace/read`,
      { method: 'POST', body: JSON.stringify({ path: criterion.path }), signal, timeoutMs: 20_000 }
    )
  );
  guard();
  if (artifact.path !== criterion.path) throw new Error('The sandbox returned a different file.');
  const content = await decodeArtifactContent(artifact, artifact);
  guard();
  const requestId = crypto.randomUUID();
  const expectedManifest = await evidenceDigest(
    JSON.stringify([
      session.organizationId,
      session.id,
      requestId,
      [[artifact.path, artifact.sha256.toLowerCase()]],
    ])
  );
  const criterionSha256 = await evidenceDigest(JSON.stringify(criterion));
  guard();
  // Decisions proves declared facts and rules. It does not execute byte comparisons.
  // Compute the bounded deterministic observation locally; never promote model claims.
  const bytes = Uint8Array.from(atob(content.contentBase64), (char) => char.charCodeAt(0));
  const text =
    criterion.kind === 'sha256'
      ? ''
      : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const matched =
    criterion.kind === 'sha256'
      ? artifact.sha256.toLowerCase() === criterion.expected
      : criterion.kind === 'contains'
        ? text.includes(criterion.expected)
        : text === criterion.expected;
  const binding = await evidenceDigest(
    JSON.stringify([expectedManifest, criterionSha256, matched])
  );
  const goal = { name: 'desktop_file_check', args: [session.id, binding] };
  const decision = await requestNsrDecision({
    scope: { tenantId: chat.tenantId, brandId: chat.brandId },
    apiKey: credentials.api_key,
    organizationId: session.organizationId,
    requestId,
    signal,
    assertCurrent: guard,
    body: {
      query:
        'Does the collected workspace file satisfy the explicitly selected deterministic check?',
      action: 'verify_workspace_file',
      authorization_goal: goal,
      session_id: session.id,
      external_ref: binding,
      hydrate_org_context: false,
      facts: [decisionFact('desktop_file_observation', session.id, binding, matched)],
      rules: [
        {
          name: 'desktop_explicit_file_check_v1',
          if: [{ name: 'desktop_file_observation', args: [session.id, binding, true] }],
          then: [goal],
          effect: 'permit',
        },
      ],
    },
  });
  guard();
  if (!matched && decision.allowed) throw new Error('NSR approved a failed file observation.');
  const verified = matched && decision.allowed;
  const verification = verificationSchema.parse({
    verified,
    outcome: verified ? 'verified' : 'failed',
    manifest_sha256: expectedManifest,
    checks: [
      {
        path: criterion.path,
        kind: criterion.kind,
        passed: verified,
        detail: matched
          ? verified
            ? 'Desktop byte check matched; NSR decision proof verified.'
            : 'Desktop byte check matched; NSR did not authorize acceptance.'
          : 'Collected bytes did not match the selected expectation.',
        sha256: artifact.sha256.toLowerCase(),
      },
    ],
    evidence_ids: [decision.decisionId],
  });
  return {
    requestId,
    source: 'decisions-v1',
    observationMatched: matched,
    decisionId: decision.decisionId,
    sessionId: session.id,
    sandboxId: session.currentSandboxId,
    organizationId: session.organizationId,
    checkedAt: new Date().toISOString(),
    path: artifact.path,
    sha256: artifact.sha256.toLowerCase(),
    sizeBytes: artifact.size_bytes,
    kind: criterion.kind,
    criterionSha256,
    verification,
  };
}
