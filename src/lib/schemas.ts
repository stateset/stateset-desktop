/**
 * Zod schemas for runtime validation of API responses.
 *
 * These mirror the TypeScript types in src/types/index.ts but enforce
 * constraints at the system boundary so type violations are caught early
 * instead of silently propagating through the app.
 */

import { z } from 'zod';

// ── Agent Sessions ────────────────────────────────────────────────────

export const AgentSessionStatusSchema = z.enum([
  'starting',
  'running',
  'paused',
  'stopping',
  'stopped',
  'failed',
]);

export const AgentSessionConfigSchema = z.object({
  agent_type: z.string().optional(),
  loop_interval_ms: z.number().default(5000),
  max_iterations: z.number().default(100),
  iteration_timeout_secs: z.number().default(300),
  pause_on_error: z.boolean().default(false),
  custom_instructions: z.string().optional().nullable(),
  mcp_servers: z.array(z.string()).nullable().default([]),
  model: z.string().default('claude-sonnet-4-5-20250929'),
  temperature: z.number().default(0.7),
});

export const AgentSessionMetricsSchema = z.object({
  loop_count: z.number().default(0),
  tokens_used: z.number().default(0),
  tool_calls: z.number().default(0),
  errors: z.number().default(0),
  messages_sent: z.number().default(0),
  uptime_seconds: z.number().default(0),
});

export const AgentSessionSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  brand_id: z.string(),
  agent_type: z.string(),
  name: z.string().optional().nullable(),
  tags: z
    .array(z.string())
    .optional()
    .nullable()
    .transform((v) => v ?? []),
  status: AgentSessionStatusSchema,
  config: AgentSessionConfigSchema.default(AgentSessionConfigSchema.parse({})),
  metrics: AgentSessionMetricsSchema.default(AgentSessionMetricsSchema.parse({})),
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().optional().nullable(),
  stopped_at: z.string().optional().nullable(),
});

// ── Brands & Tenants ──────────────────────────────────────────────────

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  tier: z.enum(['free', 'pro', 'enterprise']),
  created_at: z.string(),
});

export const BrandSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  slug: z.string(),
  name: z.string(),
  support_platform: z.string(),
  ecommerce_platform: z.string(),
  config: z.record(z.string(), z.unknown()),
  mcp_servers: z.array(z.string()),
  enabled: z.boolean(),
  created_at: z.string(),
});

// ── API response wrappers ─────────────────────────────────────────────

export const SessionsListResponseSchema = z.object({
  ok: z.boolean().optional(),
  sessions: z.array(AgentSessionSchema),
});

export const SessionResponseSchema = z.object({
  ok: z.boolean().optional(),
  session: AgentSessionSchema,
});

export const BrandsListResponseSchema = z.object({
  ok: z.boolean(),
  brands: z.array(BrandSchema),
});

export const BrandResponseSchema = z.object({
  ok: z.boolean(),
  brand: BrandSchema,
});

export const StreamTokenResponseSchema = z.object({
  ok: z.boolean(),
  token: z.string().optional(),
});

// ── Webhooks ─────────────────────────────────────────────────────────

export const WebhookStatusSchema = z.enum(['active', 'paused', 'failed']);
export const WebhookDirectionSchema = z.enum(['incoming', 'outgoing']);

export const WebhookSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  brand_id: z.string(),
  name: z.string(),
  url: z.string(),
  direction: WebhookDirectionSchema,
  events: z.array(z.string()),
  status: WebhookStatusSchema,
  secret: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  last_triggered_at: z.string().optional(),
});

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  webhook_id: z.string(),
  event: z.string(),
  status_code: z.number().nullable(),
  request_body: z.string(),
  response_body: z.string().optional(),
  duration_ms: z.number(),
  success: z.boolean(),
  created_at: z.string(),
});

export const WebhooksListResponseSchema = z.object({
  ok: z.boolean(),
  webhooks: z.array(WebhookSchema),
});

export const WebhookResponseSchema = z.object({
  ok: z.boolean(),
  webhook: WebhookSchema,
});

export const WebhookDeliveriesResponseSchema = z.object({
  ok: z.boolean(),
  deliveries: z.array(WebhookDeliverySchema),
});

// ── Validate helper ───────────────────────────────────────────────────

/**
 * Validate an API response against a Zod schema.
 * Returns the parsed data on success, or throws a descriptive error.
 * Uses `.passthrough()` so extra fields from newer API versions don't break.
 */
export function validateResponse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error('[Schema] Validation failed:', result.error.issues, '\nReceived data:', data);
  throw result.error;
}
