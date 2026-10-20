# Changelog

All notable changes to StateSet Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

## [1.1.24] - 2026-10-20

### Added

- Show a compact computer-access and policy-key checklist in Chat settings, with clear organization/brand scope, local-versus-live status and keyring lifetime guidance.
- Save model and NSR preferences per Sandbox chat after confirmed storage, restore them when reopening, and show policy-off status outside collapsed settings. Keep unsaved preferences from starting new work.
- Keep Sandbox chat drafts editable during computer setup, agent work and pending-action review. Block submission while unavailable, preserve newer edits during send acknowledgement, and require an explicit send after work finishes.
- Add a compact action recovery panel with state-specific controls, original request/computer details and bounded, unverified output previews. Keep unsafe recovery controls hidden and the composer and Stop computer visible.
- Independently check a Sandbox API chat's workspace file against expected text or a SHA-256 digest through NSR. Validate exact collected bytes and identity-bound receipts; retain receipt metadata, mark earlier checks outdated after work continues, and keep file contents and expectations out of saved transcripts.

### Fixed

- Close test-owned Electron processes and remove their temporary profiles after each native case while retaining suite-owned windows, preventing accumulation during long desktop regressions.

- Send Sandbox and NSR requests through a restricted native transport so hosted API preflights cannot block desktop chats. Bind requests to saved endpoints and credentials, reject redirects and foreign destinations, and cancel owned requests when their document closes.

- Require acknowledged credential saves and removals, serialize vault changes across brands, retain failed entries after partial setup saves, and prevent late saves from continuing after a workspace switch.
- Retain unfinished agent work with the saved task before inference begins. After reopening, distinguish interrupted work from an idle computer, include it in Needs attention, and require an explicit follow-up without replaying the task or its actions.
- Share live Sandbox activity across the conversation header, saved-chat library and command search. Show setup, pausing, recovery, file checks and shutdown consistently, then restore the saved state when work finishes.
- Honor pause requests at setup, inference and action boundaries; retain late session identities and execution receipts without starting another step. Show pending pause and saved paused state, keep cleanup uninterrupted, and reject foreign shutdown identities.
- Validate model names in UTF-8 bytes before computer access or draft submission, preserving tasks when model settings are invalid.
- Use the shared, bounded transcript reader for Sandbox API chats, including older history, position-preserving updates and keyboard-accessible return to latest. Distinguish stopped, interrupted and actively preparing computers in empty chat guidance.
- Recover pending work through read-only session reconciliation without allocating or starting a computer. Include pending actions in attention filtering even without an error.
- Bind pending computer actions to their original organization, session and sandbox before dispatch. Block replay and output acceptance after identity changes, retain uncertain receipts, and reject foreign status/startup identities.
- Check for the scoped NSR key before model inference, preserve unsent tasks when setup is incomplete, and offer connection settings beside chat errors.
- Use NSR Decisions API requests and organization-scoped API-key headers for desktop action and file checks. Require exact-goal proof replay, live approvals and execution routing; keep file contents and expectations local while submitting bound comparison observations.
- Retain every observed Sandbox API computer identity across session completion and desktop restarts so cleanup cannot be confirmed without checking the known computers.
- Preserve newly saved Sandbox API credentials after stale failures, distinguish inference-provider authentication failures, and enforce request deadlines alongside user cancellation.
- Carry bounded tool observations into follow-up agent turns, require fresh GUI observations, and clarify the scope of NSR execution-policy checks without persisting raw tool output.

## [1.1.23] - 2026-10-19

### Added

- Create a dedicated computer in the background for each new chat using the Sandbox API. Preserve chat/session identities, retry setup without allocating another session, and reopen saved computers without replaying actions. Keep durable workflows available as an explicit runtime option.

## [1.1.22] - 2026-10-19

### Fixed

- Require complete, unambiguous sandbox and policy capability checks before accepting computer readiness. Add a read-only preflight for engine database/Temporal health and live acceptance configuration, without starting workflows or exposing credentials.
- Wait for confirmed settings and owned sessions before automatically restarting agents. Cancel obsolete recovery after workspace, authentication or preference changes, preserve saved restart IDs while loading, and avoid duplicate submitted starts.
- Stop telemetry immediately when sharing is turned off, including failed saves; show acknowledged preference states, persistence errors and retry actions.
- Make all seven settings toggles distinguish on and off in both themes, with visible keyboard focus, larger click targets, and associated descriptions.
- Keep engine connection settings readable in light and dark themes, with consistent primary actions and an API-key label separated from credential storage help.
- Use the saved engine connection for native workflow requests and event streams, including custom origins in packaged apps. Keep CSP and TLS enforcement, cancel obsolete work, and verify the public bridge against an owned HTTPS engine fixture.
- Keep engine connection feedback tied to the current saved connection, workspace and draft. Ignore obsolete health responses, explain unsaved changes before testing, and preserve configured credentials when removal fails.
- Keep notifications readable and dismissible above open dialogs, including agent save failures that retain the current draft.
- Validate agent instructions, models and connector keys against engine UTF-8 byte limits before saving new profiles or submitting work. Preserve oversized drafts and legacy saved definitions, and keep local validation failures distinct from uncertain scheduled launches.
- Preserve custom background agents through concurrent saves and storage failures. Keep drafts available for retry, guard pending creation and removal, and use readable agent-editor surfaces in both themes.
- Keep dialogs above page clipping and sidebar stacking so their titles, saved profiles, and form controls remain fully visible.

## [1.1.21] - 2026-10-17

### Changed

- Keep workflow header actions readable at standard and minimum window sizes, with complete button labels and consistent light and dark surfaces.

### Security

- Bind published installers to the exact pushed version-tag commit, reject branch publication, and route local release requests through the signed multi-platform workflow. Report missing signing settings before build work.
- Move production routing to patched React Router 7, use its direct package, and remove obsolete migration flags while preserving browser and packaged hash navigation.
- Update TypeScript ESLint on its supported release line and remove unused Storybook addons to reduce vulnerable development dependencies while retaining strict lint rules.

### Fixed

- Preserve each scheduled workflow occurrence through uncertain launch responses and app restarts. Recover its original workflow through status checks, retain pause and edit intent, and prevent duplicate launches or deletion of unconfirmed runs.
- Serialize blueprint saves and removals against the latest saved collection. Import complete bundles in one acknowledged write, retain saved blueprints after storage failures, and preserve working drafts when retrying or deleting a blueprint.
- Keep the Commands field's accessible label stable after restoring saved multi-step workflows.
- Recover saved workflow settings after temporary storage or credential read failures, with a clear retry action. Protect saved workflows and connection identity until loading succeeds, preserve newer connection saves and form edits, and restore the saved engine URL in computer setup.
- Report updates only after a completed check, preserve download and restart actions across late replies, and recover failed check and restart requests with clear retry feedback. Simplify the Updates surface and make progress available to assistive technology.
- Use the built package version in renderer startup diagnostics and Settings fallbacks.

## [1.1.20] - 2026-10-16

### Changed

- Fleet actions retain progress and outcomes across navigation, continue after individual failures, and retry only failed agents. Cleanup keeps the reviewed target set and confirms failed deletions again.
- Conversation menus share keyboard navigation and theme surfaces. Rename and deletion preserve focus, and menus remain reachable in short windows.
- Confirmation dialogs and desktop previews use simpler, readable surfaces in both themes.

### Security

- Move to the supported Electron 42 runtime and explicitly prepare its binary before native builds and tests. Packaged macOS now requires version 12 or newer; native macOS notifications require signing.
- Update vulnerable runtime and development dependencies within their supported release lines, including telemetry, routing, packaging, Vite, Vitest, and the DOM test environment.

### Fixed

- Keep command search selection tied to the chosen conversation or agent during live updates. Contain long names, improve keyboard-hint contrast, expose status descriptions, and respect reduced motion without restarting scroll for status-only refreshes.
- Match workspace browsing and file-collection paths to the engine’s UTF-8 byte and control-character limits. Keep invalid addresses editable with accessible inline errors.
- Keep the workspace address in sync with folder observations while preserving typed paths. Restore keyboard focus after opening folders, reset searches between folders, and let Escape clear file search before closing computer details.
- Keep newer chat-default edits intact while a save finishes, serialize saves across brands, and show inline progress, success and retry feedback. Restore keyboard focus after removing an acceptance criterion.
- Validate new chat defaults and acceptance criteria against engine byte, path and file limits before starting work. Keep invalid drafts editable with inline feedback and preserve older saved conversations.
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
