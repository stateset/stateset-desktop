# StateSet Desktop v1.1.10

Release date: 2026-02-27

## Highlights

- Improved API authentication fallback safety for protected desktop requests.
- Added webhook UX improvements with clearer success and error feedback.
- Hardened cache-key scoping to prevent session data bleed across tenant/brand boundaries.
- Improved request metrics fidelity for error status and retry counts.
- Preserved stream log metadata in SSE parsing for better debugging context.

## Reliability Improvements

- Auth retries now rotate header formats without silently falling back to unauthenticated calls by default.
- Session detail query keys now include tenant and brand identifiers.
- Webhook delivery cache keys now include tenant and brand context.

## Validation

- `npm test -- src/lib/api.test.ts src/lib/queryKeys.test.ts src/features/webhooks/hooks/useWebhooks.test.ts src/hooks/useAgentStream.test.ts src/pages/AgentConsole.test.tsx src/pages/Webhooks.test.tsx`
- `npm run typecheck`
- `npx eslint` on all changed files
