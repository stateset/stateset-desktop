# StateSet Desktop: Technical Whitepaper

**Version 1.1.12 | March 2026**

---

## Abstract

StateSet Desktop is a cross-platform Electron application that provides a native desktop interface for managing autonomous AI customer service agents. Built on a modern React/TypeScript stack with enterprise-grade resilience patterns, the application enables operators to deploy, monitor, and interact with AI agents in real time across customer support and e-commerce workflows. This paper details the system architecture, security model, data flow patterns, and engineering decisions that underpin the platform.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [Electron Main Process](#3-electron-main-process)
4. [Renderer Application](#4-renderer-application)
5. [API Client & Resilience Layer](#5-api-client--resilience-layer)
6. [Real-Time Streaming](#6-real-time-streaming)
7. [State Management](#7-state-management)
8. [Security Architecture](#8-security-architecture)
9. [Offline Resilience & Caching](#9-offline-resilience--caching)
10. [Platform Integrations & OAuth](#10-platform-integrations--oauth)
11. [Observability & Diagnostics](#11-observability--diagnostics)
12. [Testing Strategy](#12-testing-strategy)
13. [Build & Distribution](#13-build--distribution)
14. [Future Architecture Considerations](#14-future-architecture-considerations)
15. [Conclusion](#15-conclusion)

---

## 1. Introduction

### 1.1 Problem Statement

Modern customer service operations require autonomous AI agents that can handle complex workflows — processing returns, managing orders, triaging tickets — with minimal human oversight. While cloud dashboards serve this need for browser-based access, operators managing critical agent fleets require a dedicated desktop application that provides:

- Native system integration (tray agents, desktop notifications, keyboard shortcuts)
- Real-time streaming visibility into agent reasoning and tool usage
- Offline-tolerant operation for unreliable network environments
- Secure local credential storage via OS-level encryption
- Background agent monitoring without a browser tab

### 1.2 Design Goals

StateSet Desktop was designed around five core principles:

1. **Resilience over availability** — The application must degrade gracefully. Circuit breakers, request deduplication, retry with backoff, and offline caching ensure the operator experience survives transient API failures.

2. **Security by default** — Context isolation, sandboxed renderers, CSP enforcement, and OS-level credential encryption are non-negotiable. No raw IPC channels are exposed.

3. **Operator efficiency** — Command palette navigation, comprehensive keyboard shortcuts, optimistic mutations, and background agent monitoring minimize time-to-action.

4. **Observable systems** — Structured logging, request metrics with percentile tracking, circuit breaker state visibility, and audit trails make the system introspectable.

5. **Cross-platform fidelity** — A single codebase produces native-quality experiences on macOS (Intel & Apple Silicon), Windows, and Linux.

### 1.3 Technology Summary

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| Runtime          | Electron 35 (Chromium + Node.js)              |
| UI Framework     | React 18 + TypeScript 5.3                     |
| Build System     | Vite 6.4 + electron-builder 26                |
| State Management | Zustand 4.4 (client) + React Query 5 (server) |
| Styling          | Tailwind CSS 3.4 + CSS Custom Properties      |
| Validation       | Zod 4.3 (runtime schema enforcement)          |
| Animation        | Framer Motion 10                              |
| Error Tracking   | Sentry (main + renderer processes)            |
| Testing          | Vitest 4 (unit) + Playwright 1.58 (E2E)       |

---

## 2. System Architecture

### 2.1 High-Level Topology

```
┌────────────────────────────────────────────────────────────────┐
│                     StateSet Desktop                           │
│                                                                │
│  ┌──────────────────┐     IPC      ┌────────────────────────┐  │
│  │  Main Process    │◄────────────►│  Renderer Process      │  │
│  │  (Node.js)       │  (validated)  │  (Chromium Sandbox)    │  │
│  │                  │              │                        │  │
│  │  - Window mgmt   │              │  ┌──────────────────┐  │  │
│  │  - System tray   │              │  │  React App       │  │  │
│  │  - Auto-updater  │              │  │  - Pages/Routes  │  │  │
│  │  - OAuth servers │              │  │  - Zustand Stores│  │  │
│  │  - Secure store  │              │  │  - React Query   │  │  │
│  │  - CSP headers   │              │  │  - SSE Streaming │  │  │
│  │  - Notifications │              │  └──────────────────┘  │  │
│  └──────────────────┘              └────────────────────────┘  │
│                                              │                 │
└──────────────────────────────────────────────┼─────────────────┘
                                               │
                              HTTPS + SSE      │
                                               ▼
                               ┌───────────────────────────┐
                               │  StateSet Engine API      │
                               │  engine.stateset.cloud    │
                               │                           │
                               │  - Agent orchestration    │
                               │  - Session management     │
                               │  - SSE event streaming    │
                               │  - Webhook delivery       │
                               │  - OAuth token exchange   │
                               └───────────────────────────┘
```

### 2.2 Process Isolation Model

Electron enforces strict process separation:

- **Main Process** — Privileged Node.js process managing windows, system tray, auto-updates, OAuth HTTP servers, and encrypted credential storage. No direct renderer access.
- **Preload Script** — A narrow bridge exposing 30+ typed IPC methods via `contextBridge.exposeInMainWorld()`. Every method maps to a validated `ipcRenderer.invoke()` call.
- **Renderer Process** — Sandboxed Chromium instance running the React application. No Node.js APIs, no `require()`, no filesystem access. All system interactions route through the preload bridge.

### 2.3 Directory Organization

The codebase follows a feature-based modular structure:

```
src/
├── pages/            # Route-level components (10 pages)
├── features/         # Feature modules with co-located components, hooks, utils
│   ├── agent-console/
│   ├── dashboard/
│   ├── connections/
│   ├── chat-playground/
│   ├── webhooks/
│   ├── templates/
│   └── settings/
├── components/       # 48 shared UI components
├── hooks/            # 27 shared React hooks
├── stores/           # 6 Zustand state stores
├── lib/              # Core utilities (API, schemas, metrics, cache, errors)
├── config/           # Centralized configuration
└── types/            # TypeScript type definitions

electron/
├── main.ts           # Main process (1,312 lines)
├── preload.ts        # Secure IPC bridge
├── url-security.ts   # URL allowlisting
├── sanitization.ts   # Sentry data redaction
└── oauth/            # Provider-specific OAuth flows
```

---

## 3. Electron Main Process

### 3.1 Window Lifecycle

The main window is created with hardened defaults:

```typescript
{
  contextIsolation: true,    // Strict renderer isolation
  sandbox: true,             // OS-level sandboxing
  nodeIntegration: false,    // No Node.js in renderer
  webSecurity: true,         // Enforce same-origin
  devTools: !isProduction    // Disabled in release builds
}
```

Window dimensions default to 1400x900 with a minimum of 1000x700. On macOS, the title bar is hidden with custom traffic light positioning for a native feel. The window is shown only after the `ready-to-show` event to prevent visual flash.

### 3.2 Navigation Guards

All navigation events are intercepted and validated:

- **`will-navigate`** — Only allows navigation to the renderer origin (`file://` or `localhost` dev server). All other URLs are blocked.
- **`will-redirect`** — Same validation applied to server-initiated redirects.
- **Window open handler** — External HTTPS links matching the URL allowlist open in the system browser via `shell.openExternal()`. Everything else is denied.
- **Webview prevention** — The `web-contents-created` handler blocks `<webview>` tag attachment entirely.

### 3.3 System Tray Integration

A persistent system tray icon provides always-available agent status:

- Context menu with Open, Agent Status, Check for Updates, and Quit actions
- Dynamic tooltip reflecting running agent count (e.g., "2 agents running")
- Double-click restores the main window
- Configurable minimize-to-tray behavior with a one-time instructional notification
- Agent status updates received from the renderer via IPC

### 3.4 Auto-Update Pipeline

Updates are managed via `electron-updater` with GitHub Releases as the provider:

| State         | Description                       |
| ------------- | --------------------------------- |
| `idle`        | No update activity                |
| `checking`    | Querying GitHub for new releases  |
| `available`   | New version found, downloading    |
| `downloading` | Binary transfer in progress       |
| `ready`       | Downloaded and staged for install |
| `error`       | Update check/download failed      |

The updater checks on startup (after a 5-second delay) and then hourly. Updates auto-install on application quit. Desktop notifications alert the operator when an update is available or ready. The updater is disabled during E2E tests, in development, and on Linux without AppImage.

---

## 4. Renderer Application

### 4.1 Routing & Page Structure

The application uses React Router v6 with lazy-loaded page components:

| Route               | Component      | Purpose                                     |
| ------------------- | -------------- | ------------------------------------------- |
| `/`                 | Dashboard      | Agent session list, stats, bulk operations  |
| `/agent/:sessionId` | AgentConsole   | Real-time streaming agent interaction       |
| `/playground`       | ChatPlayground | Interactive agent chat testing              |
| `/voice`            | Voice          | Voice agent interface (ElevenLabs STT/TTS)  |
| `/analytics`        | Analytics      | Usage metrics and performance charts        |
| `/connections`      | Connections    | Platform OAuth integrations and MCP servers |
| `/templates`        | Templates      | Reusable agent configuration templates      |
| `/webhooks`         | Webhooks       | Webhook endpoint management                 |
| `/settings`         | Settings       | Application preferences                     |
| `/audit-log`        | AuditLog       | System activity trail                       |
| `/login`            | Login          | API key authentication                      |
| `/register`         | Register       | Account registration                        |

All pages are wrapped in a `ProtectedRoute` guard that validates authentication before rendering. A `Suspense` boundary with a `PageLoader` fallback handles chunk loading.

### 4.2 Layout Architecture

The main layout shell consists of:

- **Sidebar** (264px) — Logo, brand selector dropdown, 9 navigation items with Lucide icons, user section with logout and version display, Electron-native drag region
- **Top Bar** — Workspace name, page title, API health indicator, notification bell with unread count, theme toggle, command palette trigger
- **Content Area** — Scrollable page content with animated route transitions via Framer Motion

### 4.3 Command Palette

A global command palette (`Cmd/Ctrl+K`) provides instant access to:

- Page navigation (all routes searchable)
- Active agent sessions (searchable by name/ID)
- Quick actions (create agent, refresh data, toggle theme)

The palette uses fuzzy matching, keyboard arrow navigation, and renders in a modal overlay.

### 4.4 Theming System

The theming system uses CSS custom properties controlled by `data-*` attributes on the document root:

```css
:root[data-theme='dark'] {
  /* Dark palette (default) */
}
:root[data-theme='light'] {
  /* Light palette overrides */
}
:root[data-accent='blue'] {
  --brand-50: ...;
  --brand-950: ...;
}
:root[data-accent='purple'] {
  --brand-50: ...;
  --brand-950: ...;
}
/* + green, amber, rose, cyan */
:root[data-compact='true'] {
  font-size: 15px;
}
:root[data-reduce-motion='true'] {
  --ui-transition-speed: 0.001ms;
}
```

Six accent colors and two base themes produce 12 visual combinations. The `data-reduce-motion` attribute respects accessibility preferences by collapsing all transitions. Tailwind utilities reference brand colors via CSS variable indirection (`text-brand-500`, `bg-brand-600`).

### 4.5 Accessibility

The application implements comprehensive accessibility support:

- **Semantic HTML** — Proper use of `<nav>`, `<main>`, `<aside>`, ARIA roles and labels
- **Skip link** — "Skip to content" link for keyboard users
- **Focus management** — `useFocusTrap()` for modals, `useAutoFocus()` for form fields
- **Keyboard navigation** — Full list navigation (`useListKeyboardNavigation`) with arrow keys, Home/End, multi-select via Shift/Ctrl, and Enter/Space activation
- **Screen reader support** — ARIA attributes on all interactive elements
- **Reduced motion** — Respects `prefers-reduced-motion` and user preference
- **E2E testing** — Dedicated Playwright accessibility suite using axe-core

---

## 5. API Client & Resilience Layer

### 5.1 Request Pipeline

Every API call flows through a multi-stage pipeline implemented in `src/lib/api.ts`:

```
Caller → apiRequest<T>()
           │
           ├─ Request Deduplication (GET only, 100ms TTL)
           │    └─ Cache hit? Return shared Promise
           │
           ├─ Circuit Breaker Gate
           │    └─ OPEN? Reject immediately
           │
           ├─ Auth Header Construction
           │    └─ Try ApiKey → Bearer → X-API-Key formats
           │
           ├─ Retry Loop (up to 3 attempts)
           │    ├─ fetch() with AbortController timeout (15s)
           │    ├─ Exponential backoff: 1s × 2^attempt + jitter
           │    ├─ Re-check circuit breaker before retry
           │    └─ Only retry on: 429, 500, 502, 503, 504
           │
           ├─ Circuit Breaker Update
           │    └─ onSuccess() or onFailure()
           │
           ├─ Zod Schema Validation
           │    └─ validateResponse(schema, data)
           │
           └─ Metrics Recording
                └─ Status, duration, retries, cache hit
```

### 5.2 Circuit Breaker

The circuit breaker protects against cascading failures from a degraded backend:

```
         5 consecutive failures
CLOSED ──────────────────────────► OPEN
  ▲                                  │
  │ 2 successes                      │ 30s timeout
  │                                  ▼
  └──────────────── HALF_OPEN ◄──────┘
                       │
                   any failure
                       │
                       └──────────► OPEN
```

Configuration: 5 failures to open, 30-second half-open timeout, 60-second failure count reset. State changes are observable via callbacks for UI integration (the `ApiHealthIndicator` component reflects circuit state).

### 5.3 Request Deduplication

Concurrent identical GET requests share a single in-flight promise. The deduplicator uses a `method:path:params` cache key with a 100ms TTL and a maximum of 100 entries. This prevents redundant network calls during rapid component remounting or React Query background refetches.

### 5.4 Fallback Endpoint Resolution

For API endpoints undergoing versioning or path migration, the client supports multi-path fallback:

```typescript
fetchWithFallbackPaths([
  `/api/v1/tenants/${tenant}/brands/${brand}/agents`,
  `/api/v1/tenants/${tenant}/agents`,
  `/api/v1/agents`,
]);
```

Each path is attempted in order. The first successful response is used. This provides forward compatibility during API evolution without client-side coordination.

### 5.5 Schema Validation

All API responses are validated at the boundary using Zod schemas before entering the application:

```typescript
const session = validateResponse(AgentSessionSchema, rawData);
```

Schemas use `.passthrough()` for forward compatibility — unknown fields from newer API versions are preserved, not rejected. Built-in transforms handle data normalization (e.g., computing webhook delivery `success` from `response_status`, stringifying nested payloads). The `unwrapDataEnvelope()` utility normalizes the engine's `{ok, data: T}` wrapper format.

---

## 6. Real-Time Streaming

### 6.1 SSE Architecture

Agent sessions emit real-time events via Server-Sent Events. The `useAgentStream()` hook manages the full lifecycle:

**Event Types:**

| Event            | Payload                 | Purpose                    |
| ---------------- | ----------------------- | -------------------------- |
| `status_changed` | `{ status, previous }`  | Agent state transitions    |
| `thinking`       | `{ content }`           | Agent reasoning visibility |
| `message`        | `{ id, role, content }` | User/assistant messages    |
| `tool_call`      | `{ name, arguments }`   | Tool invocation            |
| `tool_result`    | `{ name, result }`      | Tool execution output      |
| `log`            | `{ level, message }`    | Operational logging        |
| `error`          | `{ message, code }`     | Error reporting            |
| `metrics`        | `{ tokens, cost, ... }` | Performance counters       |
| `heartbeat`      | `{ timestamp }`         | Connection keepalive       |

### 6.2 Connection Management

The streaming client implements robust reconnection:

- **Auth cascade** — Tries stream token, then API key header, then API key query parameter
- **Exponential backoff** — 1s base, 2x multiplier, 30s ceiling, 25% jitter
- **Max reconnects** — 12 attempts before giving up
- **Online detection** — Triggers immediate reconnect on `navigator.onLine` change
- **Buffer management** — Events capped at 5,000, messages at 100 to bound memory
- **Typing indicator** — Auto-cleared after 30 seconds of inactivity

### 6.3 Agent Console UI

The `AgentConsole` page provides a rich interface for agent interaction:

- **Message stream** — Scrollable message list with auto-scroll (120px threshold) and manual scroll lock
- **Tool call visualization** — Expandable tool call/result pairs with syntax highlighting
- **Metrics panel** — Live counters for tokens, tool calls, loop iterations, cost, and uptime
- **Configuration modal** — Runtime agent parameter adjustment (model, temperature, instructions, MCP servers)
- **Export** — Conversation export to JSON or plain text
- **Approval dialog** — Human-in-the-loop approval for sensitive agent actions

---

## 7. State Management

### 7.1 Dual-Layer Architecture

State is partitioned into two layers based on data ownership:

**Server State (React Query):**

- Agent sessions, brands, webhooks, connections, analytics
- Automatic background refetch on window focus
- Configurable polling intervals (5s default for sessions)
- Cache invalidation tied to mutations
- Query key factory (`queryKeys.ts`) ensures consistent cache addressing

**Client State (Zustand):**

- Authentication and credentials (`auth.ts`)
- UI preferences and theming (`preferences.ts`)
- Command palette state (`ui.ts`)
- Notification queue (`notifications.ts`)
- Audit trail (`auditLog.ts`)
- Custom templates (`templates.ts`)

### 7.2 Optimistic Mutations

Session lifecycle operations (start, stop, pause, resume) use optimistic updates for immediate UI feedback:

```
1. Cancel pending queries for the session list
2. Snapshot current cache state
3. Apply optimistic status change to cache
4. Execute mutation against API
5a. Success → Invalidate cache for fresh data
5b. Failure → Rollback to snapshot, show error toast
```

This pattern is encapsulated in the `useOptimisticSessionMutation()` hook, which handles cancellation, snapshot, rollback, and cache invalidation as a single unit.

### 7.3 Persistence Strategy

| Store            | Backend                | Encryption                                |
| ---------------- | ---------------------- | ----------------------------------------- |
| API keys         | Electron `safeStorage` | OS keychain (Keychain/Credential Manager) |
| Preferences      | `electron-store`       | Optional (AES with env key)               |
| Audit log        | `electron-store`       | Optional                                  |
| Custom templates | `electron-store`       | Optional                                  |
| Offline cache    | IndexedDB              | None (non-sensitive data)                 |
| Session UI state | In-memory              | N/A                                       |

All Electron store operations are gated through a 22-key allowlist. Writes to unknown keys are rejected at the IPC handler level.

---

## 8. Security Architecture

### 8.1 Defense in Depth

Security is enforced at multiple layers:

**Process Level:**

- Context isolation between main and renderer
- Sandboxed renderer with no Node.js access
- Single-instance lock prevents duplicate processes

**Network Level:**

- Content Security Policy restricting script, connect, and frame sources
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`
- URL allowlist for external navigation (only `*.stateset.dev`, `github.com`, configured API hosts)
- Protocol blocking: `javascript:`, `data:`, `vbscript:`, `blob:` all denied

**IPC Level:**

- No raw `ipcRenderer` exposed to renderer
- All IPC methods are explicitly typed in the preload bridge
- Store key allowlist prevents arbitrary data access
- Input validation: string length limits (4,096 for API keys, 10MB for secrets), integer bounds checking, serialization verification

**Credential Level:**

- API keys encrypted via OS `safeStorage` API
- Migration path from legacy unencrypted storage
- OAuth client secrets cleared from environment after loading
- CSRF tokens (random 16-byte hex) for OAuth flows
- Timing-safe HMAC comparison for Shopify webhooks

**Data Level:**

- Sentry events sanitized before transmission — redacts API keys (`sk-*`), tokens, JWTs, emails, AWS credentials, GitHub tokens
- Multi-pass redaction with intermediate placeholders prevents partial exposure
- Audit log records all significant operator actions

### 8.2 Permission Model

Browser permissions are strictly controlled:

| Permission        | Policy                               |
| ----------------- | ------------------------------------ |
| `clipboard-read`  | Allowed                              |
| `clipboard-write` | Allowed                              |
| `media` (audio)   | Allowed (self-origin only, no video) |
| All others        | Denied                               |

### 8.3 Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
font-src 'self' https://fonts.gstatic.com data:;
connect-src 'self' <configured-api-hosts> wss://api.elevenlabs.io;
media-src 'self' blob: data: https:;
object-src 'none';
frame-ancestors 'none';
base-uri 'none';
form-action 'self';
upgrade-insecure-requests;
```

`unsafe-inline` for styles is a pragmatic concession for Tailwind CSS compatibility, mitigated by the absence of user-generated style content.

---

## 9. Offline Resilience & Caching

### 9.1 Offline Cache (IndexedDB)

The application maintains an IndexedDB cache (`src/lib/cache.ts`) for critical entity types:

- **Sessions** — Agent session list for dashboard rendering
- **Brands** — Brand configuration for multi-brand switching
- **Connections** — Platform integration status

Each cache entry carries a TTL. The `useOfflineCache()` hook family provides transparent cache-then-network semantics:

```
Query fires → Network available?
  ├─ Yes → Fetch from API, cache result
  └─ No  → Return cached data, show offline banner
```

### 9.2 Auth Resilience

The auth store handles network failures during initialization:

1. Attempt to validate stored API key against `/api/v1/auth/me`
2. If network error → Accept cached credentials and allow offline operation
3. If 401/403 → Clear stored key, redirect to login
4. If 5xx → Accept provided auth data as fallback

### 9.3 Health Monitoring

The `useOnlineStatus()` hook provides multi-dimensional health assessment:

- **Connectivity** — `navigator.onLine` + periodic health endpoint checks
- **API reachability** — Latency measurement against `/health`
- **Component health** — Database, NATS, Redis status from `/api/v1/health/detailed`
- **Circuit breaker state** — Both server-side and client-side circuit states
- **Retry logic** — Exponential backoff for health checks (30s base, 2min ceiling)

The `ApiHealthIndicator` component renders a colored dot reflecting the composite health state.

---

## 10. Platform Integrations & OAuth

### 10.1 Supported Platforms

StateSet Desktop supports OAuth-based integrations with three customer service and e-commerce platforms:

| Platform    | OAuth Port | Key Capabilities                          |
| ----------- | ---------- | ----------------------------------------- |
| **Shopify** | 8234       | Orders, customers, products, fulfillments |
| **Gorgias** | 8235       | Tickets, customers, account info          |
| **Zendesk** | 8236       | Tickets, users, read/write access         |

### 10.2 OAuth Flow

Each integration follows a secure OAuth 2.0 authorization code flow:

```
1. User clicks "Connect" → main process starts local HTTP server on designated port
2. CSRF state token generated (16 random bytes, hex-encoded)
3. OAuth window opens to provider's authorization URL
4. User authorizes → provider redirects to localhost callback
5. Local server validates state token and extracts authorization code
6. Main process exchanges code for access token (server-to-server)
7. Token encrypted via safeStorage and stored locally
8. OAuth window closes, renderer notified via IPC event
```

**Security measures:**

- State parameter validation prevents CSRF attacks
- Authorization code length capped at 2,048 characters
- Domain validation (regex) for Shopify stores and Gorgias/Zendesk subdomains
- Timing-safe HMAC-SHA256 verification for Shopify callbacks
- 5-minute timeout on the OAuth window
- Client credentials auto-cleared from environment in production

### 10.3 MCP Server Support

Beyond OAuth integrations, the Connections page supports custom MCP (Model Context Protocol) server configuration, allowing agents to connect to arbitrary tool servers for extended capabilities.

---

## 11. Observability & Diagnostics

### 11.1 Structured Logging

The logging system (`src/lib/logger.ts`) provides:

- **JSON output** in production, human-readable format in development
- **Session correlation** — Unique session ID included in all log entries
- **Scoped loggers** — `apiLogger`, `authLogger`, `agentLogger` with automatic context prefixes
- **Sensitive data masking** — API keys, tokens, passwords redacted before output
- **Performance timing** — `log.time()` for measuring async operations
- **Buffer** — Last 1,000 entries retained for export and debugging
- **Test suppression** — Logging disabled in test environment

### 11.2 Request Metrics

The metrics module (`src/lib/metrics.ts`) maintains a rolling window of the last 500 API calls and computes:

- **Latency percentiles** — p50, p95, p99
- **Error rate** — Percentage of 4xx/5xx responses
- **Cache hit rate** — Request deduplication effectiveness
- **Total retries** — Aggregate retry count across all calls
- **Circuit breaker trips** — Count of CLOSED→OPEN transitions

These metrics feed into the Analytics page and the `MetricsPanel` component in the Agent Console.

### 11.3 Audit Trail

The audit log store records operator actions with structured metadata:

- Agent start/stop/pause/resume events
- Brand switching
- Template creation and deletion
- Configuration changes
- OAuth connection events

Entries are capped at 500, persisted to Electron store, and viewable in the Audit Log page with filtering and search.

### 11.4 Error Tracking

Sentry integration spans both processes:

- **Main process** — Captures uncaught exceptions, unhandled rejections, and updater errors
- **Renderer process** — Captures React errors, API failures, and stream disconnections
- **Sanitization** — All events pass through a multi-pattern redactor before transmission, removing API keys, tokens, JWTs, emails, and cloud credentials

### 11.5 Error Classification

The error utility (`src/lib/errors.ts`) categorizes all errors into actionable types:

| Category     | Retryable | Suggested Action          |
| ------------ | --------- | ------------------------- |
| `NETWORK`    | Yes       | "Try Again"               |
| `SERVER`     | Yes       | "Try Again"               |
| `RATE_LIMIT` | Yes       | "Try Again" (after delay) |
| `AUTH`       | No        | "Log In"                  |
| `VALIDATION` | No        | "Dismiss"                 |
| `CLIENT`     | No        | "Dismiss"                 |
| `UNKNOWN`    | No        | "Contact Support"         |

The `useErrorHandler()` hook deduplicates error toasts (preventing repeated display of the same message) and transforms raw errors into user-friendly notifications.

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```
          ┌─────────┐
          │  E2E    │  Playwright (4 projects)
          │  Tests  │  - Electron lifecycle
         ┌┴─────────┴┐ - Visual regression
         │ Integration │ - Accessibility (axe-core)
         │   Tests     │ - Cross-feature flows
        ┌┴─────────────┴┐
        │  Component     │  Vitest + Testing Library
        │    Tests       │  - 78 test files
       ┌┴────────────────┴┐ - happy-dom environment
       │   Unit Tests      │ - API, stores, hooks, utilities
       └──────────────────-┘
```

### 12.2 Unit & Component Testing

**Framework:** Vitest 4.0 with happy-dom (jsdom avoided due to webidl-conversions crash)

**Coverage:** 78 test files across all application layers:

- Libraries: 21 files (API client, schemas, circuit breaker, metrics, cache, errors)
- Components: 15 files (Modal, Button, Dropdown, Pagination, ErrorBoundary)
- Pages: 11 files (Login, Dashboard, AgentConsole, Settings, Analytics)
- Hooks: 10 files (useErrorHandler, useOptimisticSessionMutation, useAgentStream)
- Stores: 6 files (auth, preferences, notifications, auditLog, ui, templates)
- Features: 8 files (agent-console, webhooks, chat-playground, connections)

**Test Utilities:**

- `renderWithProviders()` — Wraps components in QueryClient, Router, and ToastProvider
- `mockElectronAPI()` — Type-safe mock of the Electron preload bridge
- Custom mock patterns for Zustand stores and React Query

### 12.3 End-to-End Testing

**Framework:** Playwright 1.58 with four test projects:

| Project         | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `electron`      | App lifecycle, IPC communication, window management |
| `visual`        | Screenshot comparison with 2% diff tolerance        |
| `accessibility` | WCAG compliance via axe-core                        |
| `integration`   | Cross-feature user flows                            |

Configuration: 60-second test timeout, 2 retries in CI, single worker for visual consistency, video/trace capture on failure.

### 12.4 Code Quality Gates

- **ESLint** — Zero-warning policy with TypeScript and React hooks rules
- **Prettier** — Consistent formatting (single quotes, trailing commas, 100-char width)
- **TypeScript** — Strict mode with `noEmit` type checking
- **Pre-commit hooks** — Husky + lint-staged runs ESLint fix and Prettier on staged files
- **CI pipeline** — Lint → Typecheck → Unit tests → E2E → Build (all must pass)

---

## 13. Build & Distribution

### 13.1 Build Pipeline

The CI/CD pipeline (GitHub Actions) executes in stages:

```
┌─────────┐    ┌─────────┐    ┌────────────────────┐    ┌─────────┐
│  Test   │───►│  E2E    │───►│  Build (parallel)  │───►│ Release │
│         │    │         │    │  ┌─────┐           │    │         │
│ - Lint  │    │ - xvfb  │    │  │macOS│ x64+arm64 │    │ - GH    │
│ - Types │    │ - Report│    │  ├─────┤           │    │   Release│
│ - Tests │    │         │    │  │ Win │ x64       │    │ - Notes │
│ - Build │    │         │    │  ├─────┤           │    │ - Assets│
│         │    │         │    │  │Linux│ x64       │    │         │
└─────────┘    └─────────┘    │  └─────┘           │    └─────────┘
                              └────────────────────┘
```

### 13.2 Platform Artifacts

| Platform                      | Formats                  | Code Signing                   |
| ----------------------------- | ------------------------ | ------------------------------ |
| macOS (Intel + Apple Silicon) | DMG, ZIP                 | Hardened runtime, team signing |
| Windows (x64)                 | NSIS installer, portable | SHA-256 certificate            |
| Linux (x64)                   | AppImage, .deb           | N/A                            |

### 13.3 Auto-Update Distribution

- **macOS & Windows** — `electron-updater` checks GitHub Releases for `latest-mac.yml` / `latest.yml` manifests
- **Linux** — Auto-update supported only for AppImage format
- **Blockmap files** — Differential updates reduce download size for incremental releases

### 13.4 Vite Code Splitting

The Vite build produces optimized chunks via manual splitting:

| Chunk          | Contents                       |
| -------------- | ------------------------------ |
| `react-vendor` | React, React DOM, React Router |
| `ui-vendor`    | Framer Motion, Lucide icons    |
| `data-vendor`  | React Query, Zustand, Zod      |

This ensures vendor code is cached independently from application code, minimizing update payload for operators.

---

## 14. Future Architecture Considerations

While the current architecture is production-hardened, several areas present opportunities for further improvement as the platform scales.

### 14.1 Main-Process SSE Streaming

**Problem:** The SSE streaming connection (`useAgentStream`) lives in the Renderer process. Chromium aggressively throttles background renderers — timers, network streams, and `requestAnimationFrame` are deprioritized when a window is hidden or minimized to the system tray. This directly conflicts with the goal of background agent monitoring (Section 1.1).

**Recommendation:** Migrate the SSE connection layer to the Node.js Main Process, which is never subject to Chromium's background throttling. The main process would maintain persistent SSE connections, buffer events, and forward rate-limited updates to the renderer via IPC when the window is active. When the window is hidden, the main process triggers native OS notifications directly. This also enables a future where agents continue operating with full visibility even when the renderer is suspended.

### 14.2 Custom Protocol Handler for OAuth

**Problem:** OAuth flows rely on fixed local HTTP servers bound to ports 8234–8236 (Section 10.2). In enterprise environments, these ports may be blocked by corporate firewalls, VPN clients (e.g., Zscaler), or conflict with other developer tools — causing OAuth to fail silently.

**Recommendation:** Register a custom protocol handler via `app.setAsDefaultProtocolClient('stateset')` and use `stateset://oauth/callback` as the redirect URI. This eliminates port conflicts entirely, avoids firewall issues, and is the canonical Electron pattern for OAuth. The local HTTP servers can be retained as a fallback for providers that do not support custom schemes.

### 14.3 Event Stream Memory Management

**Problem:** The SSE event buffer is capped at 5,000 events and 100 messages (Section 6.2). For long-running agent sessions, holding thousands of deeply nested JSON objects in the React component tree creates GC pressure and potential UI stutter during garbage collection pauses.

**Recommendation:** Implement a tiered storage strategy: keep only the most recent N events (e.g., 200) in React state for rendering, and persist the full event history to IndexedDB or a local SQLite database (accessible via the main process). Pair this with virtual scrolling (`@tanstack/react-virtual`) in the Agent Console so that older events are paged into memory only when the operator scrolls upward. This bounds memory usage regardless of session duration.

### 14.4 Integrated Query Persistence

**Problem:** The offline cache (Section 9.1) is implemented as a custom IndexedDB wrapper (`useOfflineCache`) that operates alongside React Query. This creates two parallel caching layers with independent invalidation logic.

**Recommendation:** Replace the custom wrapper with TanStack Query's official `PersistQueryClient` plugin backed by an IndexedDB persister (e.g., `idb-keyval`). This automatically hydrates the React Query cache from disk on startup, eliminates the need for custom cache-then-network fallback logic, and ensures that cache invalidation is governed by a single, well-tested system.

### 14.5 Local AI Fallback for Offline Operation

**Problem:** When the circuit breaker is OPEN or the network is unavailable, operators can view cached data but cannot take any actions — they are effectively locked out of agent interaction.

**Recommendation:** Leverage the desktop runtime to integrate a lightweight local LLM (via `Transformers.js`, Ollama bindings, or `llama.cpp` via a Node.js addon). This would enable basic offline capabilities: drafting customer replies from cached context, summarizing agent session history, or generating configuration suggestions. Actions taken offline would be queued and synced to the backend when connectivity is restored. This transforms the offline experience from read-only to productive.

### 14.6 Multi-Operator Conflict Resolution

**Problem:** Optimistic mutations (Section 7.2) assume a single-operator model. If two operators manage the same agent session or modify the same template concurrently, the last write wins — potentially overwriting another operator's changes without warning.

**Recommendation:** For collaborative resources (templates, agent configurations, webhook settings), consider integrating a CRDT (Conflict-free Replicated Data Type) library such as Yjs or Automerge. CRDTs enable true multiplayer editing by merging concurrent changes deterministically without a central coordinator. For simpler cases, server-side optimistic locking with version vectors (ETags) provides conflict detection without the complexity of full CRDT integration.

---

## 15. Conclusion

StateSet Desktop demonstrates that desktop applications remain the right choice for operational tooling where reliability, security, and system integration are paramount. The architecture achieves its design goals through:

- **Resilience** — A four-layer defense (deduplication → retry → circuit breaker → offline cache) ensures operators maintain visibility even during API degradation.
- **Security** — Process isolation, CSP enforcement, IPC allowlisting, and OS-level credential encryption establish a zero-trust boundary between the network and the operator.
- **Performance** — Lazy-loaded routes, virtual scrolling, request deduplication, and optimistic mutations keep the interface responsive under load.
- **Observability** — Structured logging, percentile metrics, circuit breaker visibility, and audit trails make the system transparent to both operators and developers.
- **Quality** — 78 test files, four E2E test projects, strict linting, and type checking enforce correctness across the codebase.

The application serves as infrastructure for autonomous agent operations — a control plane where reliability is not a feature but a requirement.

---

_StateSet, Inc. | MIT License | https://github.com/stateset/stateset-desktop_
