# Release Checklist - StateSet Desktop

## Scope

This checklist covers local QA, E2E verification, packaging, and publishing for
the Electron desktop app.

## Prerequisites

- Node.js 22.12+ (`nvm use`)
- Git clean or changes understood
- Display available for Electron tests (Xvfb ok on Linux)
- Port 5173 available (Vite dev server)

## Required Environment Variables

- `STORE_ENCRYPTION_KEY` (required for production builds)
- `SENTRY_DSN` (optional, but recommended for production)
- `VITE_API_URL` (optional; defaults to production engine)
- `STATESET_ENGINE_API_KEY` (for integration tests)
- `STATESET_SANDBOX_API_KEY` (for integration tests)

## Pre-Release QA (Local)

1. Install deps

```bash
npm install
```

2. Lint + typecheck + unit tests

```bash
npm run lint
npm run typecheck
npm run test
```

3. E2E (Node 22.12+, display required)

```bash
npm run test:e2e
```

4. Visual snapshots (only if UI changed)

```bash
npm run test:e2e:update-snapshots
npm run test:e2e -- --project=visual
```

5. Integration tests (requires API keys)

```bash
npm run test:e2e -- --project=integration
```

## Smoke Test Runbook (App UI)

Authentication

- Login via API key; confirm tenant + brand load.
- Logout and re-login.

Dashboard

- Sessions list loads; search + filters work.
- Open a session from the list.

Agent Lifecycle

- Create an agent.
- Start, pause/resume, and stop.
- Status updates reflect in the UI.

Streaming

- Start stream; verify live events appear.
- Disconnect/reconnect stream.

Config Updates

- Update config and save (full config object).
- Confirm updated values render.

Connections

- Add a manual connection; test connection.
- Disconnect; verify local fallback when vault is unavailable.

Settings

- Theme toggle persists after restart.
- Tray toggle persists after restart.
- Sandbox health test runs with valid key.

Offline

- Disconnect network; verify offline banner and cached sessions.
- Reconnect; data refreshes.

Onboarding

- First-run flow completes and stays completed.

## Build & Package

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Artifacts are emitted to `release/`.

## Publish

1. Tag and release with electron-builder

```bash
npm run release
```

2. Verify GitHub release artifacts and update feed.

## Post-Release

- Install the released build on each platform.
- Verify auto-update check in Settings.
- Monitor Sentry for startup/regression errors.

## Rollback Plan

- Revert to the previous release tag and re-publish.
- If needed, disable auto-updates server-side.

## Troubleshooting

- Playwright needs Node 18+.
- Visual/E2E require a display (use Xvfb on CI).
- If Vite cannot bind to 5173, free the port or set a different port for
  `npm run dev:vite` and update Electron dev URL accordingly.
