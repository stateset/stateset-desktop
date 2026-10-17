# Release Checklist - StateSet Desktop

## Scope

This checklist covers local QA, E2E verification, packaging, and publishing for
the Electron desktop app.

## Prerequisites

- Node.js 22.12+ (`nvm use`)
- Publication requires a clean checkout matching the pushed version tag
- Display available for Electron tests (Xvfb ok on Linux)
- Port 5173 available for native checks, or set `STATESET_DESKTOP_TEST_PORT=3000` when the development server already uses 5173

## Configuration and credentials

Fresh profiles create a private per-install configuration key automatically.
`STORE_ENCRYPTION_KEY` is an optional runtime override for deployments that
already manage their own key; it is not a production build prerequisite.
Back up the original key with encrypted configuration. Existing encrypted data
requires its original `.store-key` or configured override.

- `SENTRY_DSN` and `VITE_SENTRY_DSN` are optional telemetry configuration.
- `VITE_API_URL` is optional and defaults to the production engine.
- `STATESET_ENGINE_API_KEY` and `STATESET_SANDBOX_API_KEY` enable their live
  integration checks. Live computer-chat acceptance separately needs the
  designated `CHAT_TEST_*` workspace described in [COMPUTER_CHATS.md](docs/COMPUTER_CHATS.md).
- Published installers require the GitHub signing and notarization settings
  listed in [release verification](docs/RELEASE_VERIFICATION.md). Review builds
  can remain unsigned.

## Pre-Release QA (Local)

On the shared workstation, route builds, checks and tests through the shared
Buildr queue as described in [release verification](docs/RELEASE_VERIFICATION.md).

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
npm run build:mac -- --publish never
npm run build:win -- --publish never
npm run build:linux -- --publish never
```

Artifacts are emitted to `release/`.

## Publish

After QA, commit the version, lockfile and changelog, create an annotated
`vVERSION` tag matching `package.json`, and push the branch and tag. The tag push
automatically starts the signed multi-platform release workflow. Keep version
tags immutable; source changes require a new version.

For a manual retry after a previous run has finished, inspect the request first:

```bash
npm run release -- --dry-run
npm run release
```

The dry run checks the clean checkout against the pushed tag and prints the
exact workflow request. `npm run release` requests that tagged workflow with
its expected commit; it does not build or publish installers locally. Manual
workflow runs default to build-only. Publication requests from branch refs,
version mismatches and changed tag targets are rejected.

The workflow checks source and required signing settings before installing
build dependencies, then rechecks source before publishing. Platform signing,
notarization, updater integrity and installer checks remain required. A workflow
request is not proof of publication: inspect the run and release assets before
announcing a release.

## Post-Release

- Install the released build on each platform.
- Verify auto-update check in Settings.
- Monitor Sentry for startup/regression errors.

## Rollback Plan

- Revert the application change in a new patch version and publish its new tag.
- Preserve existing version tags and released artifacts.
- If needed, disable auto-updates server-side.

## Troubleshooting

- This repository requires Node.js 22.12+ for Playwright and its build tools.
- Visual/E2E require a display (use Xvfb on CI).
- If the development server occupies 5173, use
  `STATESET_DESKTOP_TEST_PORT=3000` for native verification instead of stopping it.
