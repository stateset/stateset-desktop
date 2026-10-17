import { z } from 'zod';

export const budgetSchema = z.object({
  max_cost_cents: z.number().int().min(1).max(2000),
  max_tokens: z.number().int().min(8192).max(1_000_000),
  max_actions: z.number().int().min(1).max(500),
  max_runtime_seconds: z.number().int().min(60).max(86400),
});
export const criterionSchema = z.object({
  path: z.string().min(12).max(1024),
  kind: z.enum(['contains', 'equals', 'json', 'sha256', 'png']),
  expected: z.unknown(),
  pointer: z.string().optional(),
});
export const configurationSchema = z.object({
  model: z.string().trim().min(1).max(255),
  budget: budgetSchema,
  criteria: z.array(criterionSchema).max(8),
  permissions: z.object({
    allowed_executables: z.array(z.string()).max(32),
    allow_gui: z.boolean(),
    require_action_approval: z.boolean(),
  }),
  mcp_servers: z.array(z.string()).max(4),
});
export type DurableChatConfiguration = z.infer<typeof configurationSchema>;
export const DEFAULT_CHAT_CONFIGURATION: DurableChatConfiguration = {
  model: 'claude-sonnet-4-6',
  budget: { max_cost_cents: 500, max_tokens: 100000, max_actions: 100, max_runtime_seconds: 3600 },
  criteria: [],
  permissions: {
    allowed_executables: [
      'cat',
      'ls',
      'pwd',
      'rg',
      'head',
      'tail',
      'wc',
      'sort',
      'jq',
      'python3',
      'node',
      'mkdir',
    ],
    allow_gui: true,
    require_action_approval: false,
  },
  mcp_servers: [],
};
const policySchema = z
  .object({
    final_verdict: z.enum(['allow', 'deny', 'ask_user', 'rewrite']),
    evaluation: z
      .object({
        canonical_action_hash: z.string(),
        rewritten_action: z.unknown().nullable().optional(),
        triggered_rules: z.array(z.object({ reason: z.string() })).default([]),
      })
      .passthrough(),
    evidence_ids: z.array(z.string()).default([]),
  })
  .passthrough();
export const artifactSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  media_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  content_base64: z.string().max(180000).optional(),
});
export const durableStatusSchema = z.object({
  version: z.literal(1),
  status: z.string(),
  request_id: z.string(),
  brand_id: z.string(),
  session: z
    .object({
      id: z.string(),
      organizationId: z.string(),
      status: z.string(),
      currentSandboxId: z.string().nullable().optional(),
    })
    .passthrough()
    .nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system', 'tool']),
      content: z.string(),
      timestamp: z.number(),
      tool: z
        .object({
          name: z.string(),
          status: z.enum(['running', 'success', 'error']),
          resultPreview: z.string().optional(),
        })
        .optional(),
    })
  ),
  events: z.array(
    z.object({ id: z.number(), kind: z.string(), at: z.number(), detail: z.unknown() })
  ),
  last_event_id: z.number(),
  pending_action: z
    .object({
      request_id: z.string(),
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()),
      command: z.array(z.string()).nullable(),
      admission: policySchema.nullable(),
      result_available: z.boolean(),
      review_started_ms: z.number(),
      rewritten: z.boolean(),
    })
    .nullable(),
  artifacts: z.array(artifactSchema),
  verification: z
    .object({
      verified: z.boolean(),
      outcome: z.enum(['verified', 'failed', 'observed_only']),
      manifest_sha256: z.string(),
      checks: z.array(
        z.object({
          path: z.string(),
          kind: z.string(),
          passed: z.boolean(),
          detail: z.string(),
          sha256: z.string().nullable(),
        })
      ),
      evidence_ids: z.array(z.string()),
    })
    .nullable(),
  workspace: z
    .object({
      path: z.string(),
      entries: z.array(
        z.object({
          name: z.string(),
          path: z.string(),
          type: z.enum(['file', 'directory', 'unsupported']),
          size_bytes: z.number(),
        })
      ),
    })
    .nullable(),
  screenshot: z.string().max(200100).nullable(),
  checkpoint: z.record(z.string(), z.unknown()).nullable(),
  usage: z.record(z.string(), z.unknown()),
  budget: budgetSchema,
  actions: z.number(),
  turns: z.number(),
  tokens: z.number(),
  paused: z.boolean(),
  stop_requested: z.boolean(),
  cleanup_verified: z.boolean(),
  error: z.string().nullable(),
  generation: z.number(),
});
export type DurableChatStatus = z.infer<typeof durableStatusSchema>;
export interface DurableChatIdentity {
  version: 2;
  workflowId: string;
  runId?: string;
  engineUrl: string;
  configuration: DurableChatConfiguration;
  initialMessage?: { id: string; content: string };
  importedMessages?: { id: string; content: string }[];
  closeAfterTurn?: boolean;
}
export const setupReportSchema = z
  .object({
    version: z.literal(1),
    ready: z.boolean(),
    checks: z.array(
      z.object({ key: z.string(), status: z.enum(['pass', 'fail']), message: z.string() })
    ),
    mcp_servers: z.array(z.object({ key: z.string(), ready: z.boolean() })),
  })
  .refine(
    (report) =>
      !report.ready ||
      (report.checks.length > 0 && report.checks.every((check) => check.status === 'pass')),
    {
      message: 'The ready diagnostic report must include passing connection checks.',
    }
  );
export type SetupReport = z.infer<typeof setupReportSchema>;
export function terminalChat(status: string) {
  return ['completed', 'stopped', 'budget_exhausted', 'failed', 'cleanup_pending'].includes(status);
}
