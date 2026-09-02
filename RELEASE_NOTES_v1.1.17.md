# StateSet Desktop v1.1.17

Release date: 2026-09-02

## Highlights

- Added durable background workflows: a new Workflows page with scheduling, live status monitoring, and desktop notifications on terminal states.
- Added durable agent profiles and blueprint transfer support for reusable workflow definitions.
- Added hardened command validation for workflow step commands (`workflowCommandSecurity`).
- Refactored background-agent settings for clearer structure.

## Reliability Improvements

- Workflow monitor polls only active (non-terminal) workflows and records per-workflow errors without stopping the poll loop.
- Scheduler claims due schedules exactly once and waits for the previous run before launching the next.
- Store persistence guards keep workflow state consistent across restarts.

## UX Improvements

- Background workflow completion and abnormal stops surface as in-app notifications (and desktop notifications when enabled).
- Modal and layout accessibility follow-ups.

## Verification

- `npx vitest run` — full unit suite green (including new `useDurableWorkflowMonitor` coverage: skip-gates, status polling, terminal notifications, error recording)
- `npm run typecheck`
- `npx eslint src electron --max-warnings 0`
