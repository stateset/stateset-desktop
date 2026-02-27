# Desktop ↔ Engine API Alignment

Last verified: **February 27, 2026**

This document tracks how `stateset-desktop` integrates with
`/home/dom/stateset-orchestration-engine`, with emphasis on payload compatibility
and failure-safe behavior.

## Goals

- Keep desktop runtime stable across engine response variants.
- Fail closed on auth/scope errors.
- Avoid silent UI breakage when engine payloads evolve.

## Contract Matrix

| Area           | Desktop Client Path                             | Engine Route Family                                                  | Notes                                                                                                    |
| -------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Auth           | `src/lib/registration.ts`, `src/stores/auth.ts` | `/api/v1/auth/*`                                                     | `register/login/me` aligned. `forgot-password` is optional; desktop now returns a dedicated 404 message. |
| Health         | `src/hooks/useOnlineStatus.ts`                  | `/health`, `/api/v1/health/detailed`, `/health/detailed`             | Desktop prefers authenticated detailed route and falls back to legacy route only on 404.                 |
| Agent sessions | `src/lib/api.ts` (`agentApi`)                   | `/api/v1/tenants/:tenant_id/agents` and `/brands/:brand_id/agents/*` | Session CRUD/start-stop config + stream token aligned.                                                   |
| Agent stream   | `src/hooks/useAgentStream.ts`                   | `/stream/token`, `/stream`                                           | Supports query-token and API-key auth strategies for SSE.                                                |
| Secrets        | `src/lib/api.ts` (`secretsApi`)                 | `/secrets` + `/secrets/:platform/test`                               | Handles canonical `{ok,data:{platforms}}` and legacy variants.                                           |
| Webhooks       | `src/lib/api.ts` (`webhooksApi`)                | Tenant webhook routes + brand create route                           | Desktop now normalizes both minimal create responses and canonical delivery/test payloads.               |

## High-Risk Drift Areas and Mitigations

### 1) Webhook Create Response Shape

Engine create handlers can return minimal objects:

- `id`
- `url`
- `events`
- `secret`
- `enabled`
- `created_at`

Desktop mitigation:

- `EngineWebhookSchema` accepts optional `tenant_id`, `brand_id`, and `updated_at`.
- `webhooksApi.create(...)` applies fallbacks from request context:
  - tenant id from method arg
  - brand id from active selection
  - name from submitted create payload
  - `updated_at` defaulted to `created_at`

### 2) Webhook Delivery Payload Shape

Engine canonical delivery uses DB-oriented fields:

- `payload` as JSON object
- `response_status`
- `attempts`
- `delivered_at`
- no guaranteed `duration_ms` / `success`

Desktop mitigation:

- `EngineWebhookDeliverySchema` accepts object/string payloads.
- payload is normalized to string JSON for renderer usage.
- `duration_ms` defaults to `0` when absent.
- `success` is derived from `response_status` when absent.

### 3) Webhook Test Endpoint Shape

Engine may return:

- legacy test result (`{ success, status_code, duration_ms }`)
- canonical `ApiResponse<WebhookDelivery>`

Desktop mitigation:

- `WebhookTestResponseSchema` accepts both and transforms into:
  - `success: boolean`
  - `status_code: number | null`
  - `duration_ms: number`

### 4) Detailed Health Response Variants

Potential drift:

- `{ ok, data }` envelope vs direct object
- unknown/missing check statuses
- missing circuit breaker keys

Desktop mitigation:

- `parseDetailedHealth(...)` unwraps either shape.
- unknown check statuses normalize to `unknown`.
- missing circuit breaker entries default to `closed`.

## Regression Tests Covering Alignment

- `src/lib/api.test.ts`
  - webhook create minimal response normalization
  - canonical webhook test delivery normalization
  - canonical webhook deliveries normalization
- `src/lib/schemas.test.ts`
  - relaxed webhook schema (optional tenant/updated fields)
  - delivery normalization (`payload`, `duration_ms`, `success`)
  - webhook test response normalization
- `src/hooks/useOnlineStatus.test.ts`
  - detailed health fallback behavior
  - envelope parsing and unknown status normalization
- `src/lib/registration.test.ts`
  - dedicated 404 handling for optional password reset endpoint

## Suggested Ongoing Guardrails

1. Keep this file updated whenever engine route signatures or envelopes change.
2. Add a CI contract check that snapshots representative engine responses and validates desktop schemas.
3. Treat all new engine fields as additive; avoid requiring them in desktop schemas unless truly mandatory.
