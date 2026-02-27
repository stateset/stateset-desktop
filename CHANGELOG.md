# Changelog

All notable changes to StateSet Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
