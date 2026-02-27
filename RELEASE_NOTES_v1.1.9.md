# StateSet Desktop v1.1.9

Release date: 2026-02-27

## Highlights

- Hardened desktop ↔ engine webhook contract handling for create, test, and delivery payload variants.
- Improved detailed health parsing resilience, including support for `{ ok, data }` response envelopes.
- Added explicit contract documentation:
  - `docs/ARCHITECTURE.md` desktop-engine contract section
  - `docs/ENGINE_API_ALIGNMENT.md` drift matrix and guardrails

## Reliability Improvements

- Normalizes canonical engine webhook delivery payloads where `payload` may be JSON and `success/duration_ms` may be absent.
- Normalizes webhook test responses whether returned as compact summary or delivery-shaped payload.
- Preserves webhook names on create when server responses omit optional description fields.

## UX Improvements

- Password reset now returns a dedicated, actionable message when the endpoint is not yet enabled.

## Verification

- `npm test -- src/lib/api.test.ts src/lib/schemas.test.ts src/hooks/useOnlineStatus.test.ts src/lib/registration.test.ts`
- `npm run typecheck`
- `npx eslint src/lib/api.ts src/lib/schemas.ts src/hooks/useOnlineStatus.ts src/lib/registration.ts src/lib/api.test.ts src/lib/schemas.test.ts src/hooks/useOnlineStatus.test.ts src/lib/registration.test.ts`
