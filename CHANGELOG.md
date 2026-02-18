# Changelog

All notable changes to StateSet Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.5] - 2026-02-14

### Fixed

- CI release workflow: handle unsigned macOS and Windows builds when code signing certs are not configured
- Centralized artifact upload in release workflow using `softprops/action-gh-release@v2`

## [1.0.4] - 2026-02-06

### Added

- Global command palette (`Ctrl/Cmd+K`) with top-bar entry point and global shortcuts for Dashboard, Analytics, Connections, and Settings
- Agent Console: `Ctrl/Cmd+F` search across tools, results, logs, and errors
- Agent Console: `Ctrl/Cmd+E` export conversation, `Ctrl/Cmd+Shift+L` toggle logs
- Agent Console: collapsible tool results with copy, raw/pretty view, and truncated preview for large payloads
- Dashboard: `/?create=1` deep link to open Create Agent dialog
- Dashboard: session name display and copy action button
- Analytics: tool calls by agent type chart (replaced simulated data)

### Changed

- Node.js 22.12+ now required (`.nvmrc`, engines field, preflight script)
- Vite config migrated to `vite.config.mts` (eliminates CJS deprecation warning)
- React Router v7 future flags enabled
- Markdown code highlighting lazily loaded with minimal language set

### Fixed

- Duplicate Dashboard shortcuts modal removed
- Vite build warnings for missing CSP env placeholders
- Storybook/Chromatic dependency conflicts under strict peer deps

### Security

- Electron upgraded to 35.7.5 (fixes GHSA-vmqv-hx8q-j7mg)
- `@sentry/electron` upgraded to 7.7.1 (fixes GHSA-593m-55hh-j8gv)
- Vite upgraded to 6.4.1 + Vitest to 4.0.18 (fixes GHSA-67mh-4wv8-2f99)
- Storybook upgraded to 8.6.15 (fixes GHSA-8452-54wp-rmv6)
- `electron-builder` upgraded to 26.7.0 (removes `tar` high-severity advisories)
- `lodash@4.17.23` enforced via npm overrides
- `npm audit` clean (0 vulnerabilities)

## [1.0.0] - 2026-01-19

### Added

- Initial release
- Autonomous AI agent management with real-time SSE streaming
- OAuth integrations for Shopify, Gorgias, and Zendesk
- Multi-brand support with separate configurations
- Agent lifecycle controls (start, pause, resume, stop)
- Metrics dashboard for token usage, tool calls, and performance
- Secure credential storage via Electron safeStorage
- Cross-platform builds (macOS, Windows, Linux)
