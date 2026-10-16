# Changelog

All notable changes to StateSet Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- Fleet actions retain progress and outcomes across navigation, continue after individual failures, and retry only failed agents. Cleanup keeps the reviewed target set and confirms failed deletions again.
- Conversation menus share keyboard navigation and theme surfaces. Rename and deletion preserve focus, and menus remain reachable in short windows.
- Confirmation dialogs and desktop previews use simpler, readable surfaces in both themes.

### Security

- Move to the supported Electron 42 runtime and explicitly prepare its binary before native builds and tests. Packaged macOS now requires version 12 or newer; native macOS notifications require signing.
- Update vulnerable runtime and development dependencies within their supported release lines, including telemetry, routing, packaging, Vite, Vitest, and the DOM test environment.

### Fixed

- Retain native, bundle, and installer test evidence independently so package checks cannot erase earlier failures. Wait for chat menu save completion before testing another keyboard command.
- Keep imported multilingual chat context within the workflow engine's UTF-8 message limit so continued computers can start without losing the original conversation.
- Allow bounded chat history and acceptance criteria through the native bridge within the engine's JSON byte limit, while rejecting oversized UTF-8 requests.
- Resize chat drafts with the available space while keeping focus and long drafts scrollable. Keep message-limit warnings readable in both themes and preserve oversized drafts for editing.
- Keep long-chat reading positions stable as new messages arrive. Show new-message counts without moving the reader, follow late content resizing only at the end, restore transcript focus when history controls disappear, and keep draft indicators readable in both themes.
- Recover from stale page links with clear dashboard and chat destinations. Keep error recovery inside the packaged router, reset failed pages on navigation, preserve healthy-page input, and offer reload when a page module cannot be loaded.
- Honor the app’s reduced-motion preference throughout navigation, settings, menus, and page content. Keep content immediately visible without decorative fade-ins when reduced motion is requested.
- Keep computer-chat instructions, reviews, file reads and status responses bound to the original connection across asynchronous saves and credential changes. Serialize connection updates and invalidate cached approval readiness on scope changes.
- Match dashboard control names to their visible text for speech and screen-reader navigation, including workspace selectors, commands, metrics, and agent rows.
- Run native verification on a separate trusted localhost port when the development server is already open, keeping navigation and fixture origins aligned.
- Keep late agent mutations and cache rollbacks bound to their original workspace and credential. Preserve newer data and caches cleared by logout.
- Retain the live acceptance harness's owned workflow identity before starting, verify cleanup receipts, and report unconfirmed shutdown. Run its local failure tests in release CI.

## [1.1.19] - 2026-10-15

### Added

- Added computer chat workspaces with sandbox session identity, durable workflow execution, approval recovery, output verification, and workspace files and deliverables.
- Added local MCP server setup, connection probes, tool discovery, and verification summaries.
- Added isolated desktop startup and installer checks, updater asset validation, and signing requirements for published releases.

### Changed

- Simplified desktop surfaces, dashboard metrics, controls, and navigation with consistent light and dark themes and keyboard support.
- Strengthened local credential handling and per-install configuration encryption.

### Fixed

- Keep unavailable dashboard data distinct from an empty fleet, preserve saved agents after refresh failures, and expose retry and offline states.
- Count paused and transitioning agents accurately and keep bulk selection scoped to the visible page.
- Report selected-agent bulk action outcomes accurately and prevent duplicate in-flight requests.

## [1.1.18] - 2026-09-02

### Added

- Added unit coverage for the app shell keyboard shortcuts and chrome (+9 Layout tests), the notifications center component (+12 tests), the durable workflow monitor (6 tests), and durable workflow settings (8 tests).
- Added `RELEASE_NOTES_v1.1.17.md` and backfilled CHANGELOG entries for 1.1.11–1.1.16.

## [1.1.17] - 2026-09-02

### Added

- Added durable background workflows: Workflows page, scheduler/monitor/event hooks, durable-workflows store, agent profiles, and blueprint transfer.
- Added command validation for workflow step commands.
- Added unit coverage for the durable workflow monitor (poll gates, status updates, terminal notifications, error recording).

### Changed

- Refactored background-agent settings for clearer structure.
- Follow-up accessibility improvements to modal and layout components.

## [1.1.16] - 2026-05-18

### Added

- Added IPC rate limiting for high-frequency channels in the Electron main process.
- Added a startup warning when the development store is unencrypted.
- Added light-theme coverage to the accessibility suite.

### Changed

- CI now enforces a vitest coverage floor.
- Auto-updater disable state is logged at startup.
- UI refresh pass across dashboard, login, and analytics surfaces.

## [1.1.15] - 2026-03-11

### Changed

- Refreshed app loading screen, layout, dashboard, analytics, and login surfaces with updated styling.
- Updated sandbox library, agent stream hook, and schemas alongside their tests.
- Added a standalone end-to-end harness (`test-e2e.js`).

## [1.1.14] - 2026-03-09

### Changed

- Reworked the auth store with expanded unit coverage.
- Hardened OAuth utilities and request sanitization with additional tests.
- Improved offline cache behavior and added a routing helper.

## [1.1.13] - 2026-03-05

### Added

- Extracted Electron runtime-asset resolution into its own tested module.
- Added whitepaper documentation (`WHITEPAPER.md`).

### Changed

- Hardened API client and auth flows with expanded tests.

## [1.1.12] - 2026-03-01

### Fixed

- Hardened command palette Escape handling with regression coverage.

## [1.1.11] - 2026-02-27

### Changed

- Extracted SSE stream parsing from the agent stream hook into `lib/streamParsing` (re-exported for compatibility).
- Added a shared animations library and refined API client behavior.
- Updated notifications, toasts, metrics, and connection-form surfaces.

## [1.1.10] - 2026-02-27

### Added

- Added stronger API integration tests for auth-header fallback behavior and metrics status fidelity.
- Added expanded query-key tests for webhook and session cache scoping.

### Changed

- Hardened API auth fallback flow to prevent unintended unauthenticated fallthrough on protected requests.
- Improved webhook mutation UX with consistent success and failure notifications.
- Scoped session detail query keys by tenant and brand to prevent cross-tenant cache collisions.
- Preserved stream log metadata in SSE event parsing for richer troubleshooting context.

### Fixed

- Fixed API metrics recording to retain HTTP status and retry count for sanitized error paths.

## [1.1.9] - 2026-02-27

### Added

- Added `docs/ENGINE_API_ALIGNMENT.md` to document verified desktop-to-engine API contracts, drift risks, and guardrails.
- Expanded architecture docs with a concrete route/auth contract matrix and verification commands.

### Changed

- Hardened webhook API compatibility in desktop client parsing for canonical engine payloads (create/test/deliveries), while preserving backward compatibility.
- Improved detailed health parsing to handle `{ ok, data }` envelopes and normalize unknown component statuses safely.
- Improved password-reset UX by returning a dedicated message when `POST /api/v1/auth/forgot-password` is unavailable (`404`).

### Fixed

- Prevented empty webhook names in desktop state when engine create responses omit optional description fields.

## [1.1.3] - 2026-02-22

### Added

- Bumped package metadata and lockfile versions to `1.1.3`.
- Added release notes for the `v1.1.3` public release.

### Notes

- This patch release contains versioning and release-notes updates only.

## [1.0.0] - 2026-02-18

### Added

- Public release baseline for the open repository.
- Added release hardening, packaging, and security-sanitization updates from the latest internal release stream into a unified public baseline.

### Notes

- Package metadata for this repository is versioned at `1.0.0`.
- Earlier private iterations (including 1.0.4 and 1.0.5) are intentionally omitted from this open-source baseline.

## Private Baseline - 2026-01-19

### Added

- Initial release
- Autonomous AI agent management with real-time SSE streaming
- OAuth integrations for Shopify, Gorgias, and Zendesk
- Multi-brand support with separate configurations
- Agent lifecycle controls (start, pause, resume, stop)
- Metrics dashboard for token usage, tool calls, and performance
- Secure credential storage via Electron safeStorage
- Cross-platform builds (macOS, Windows, Linux)
