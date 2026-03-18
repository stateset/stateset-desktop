# StateSet Desktop: Technical Whitepaper

**Version 1.1.15 | March 2026**

---

## Abstract

StateSet Desktop is a cross-platform Electron application that provides a native desktop interface for managing autonomous AI customer service agents. Built on a modern React/TypeScript stack with enterprise-grade resilience patterns, the application enables operators to deploy, monitor, and interact with AI agents in real time across customer support and e-commerce workflows. This paper details the system architecture, security model, data flow patterns, real-time streaming infrastructure, voice interface, and engineering decisions that underpin the platform.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture](#2-system-architecture)
3. [Electron Main Process](#3-electron-main-process)
4. [Renderer Application](#4-renderer-application)
5. [Data Model & Type System](#5-data-model--type-system)
6. [API Client & Resilience Layer](#6-api-client--resilience-layer)
7. [Real-Time Streaming](#7-real-time-streaming)
8. [State Management](#8-state-management)
9. [Security Architecture](#9-security-architecture)
10. [Offline Resilience & Caching](#10-offline-resilience--caching)
11. [Platform Integrations & OAuth](#11-platform-integrations--oauth)
12. [Voice Interface](#12-voice-interface)
13. [Agent Templates & Configuration](#13-agent-templates--configuration)
14. [Observability & Diagnostics](#14-observability--diagnostics)
15. [Testing Strategy](#15-testing-strategy)
16. [Build & Distribution](#16-build--distribution)
17. [Future Architecture Considerations](#17-future-architecture-considerations)
18. [Conclusion](#18-conclusion)

---

## 1. Introduction

### 1.1 Problem Statement

Modern customer service operations require autonomous AI agents that can handle complex workflows — processing returns, managing orders, triaging tickets — with minimal human oversight. While cloud dashboards serve this need for browser-based access, operators managing critical agent fleets require a dedicated desktop application that provides:

- Native system integration (tray agents, desktop notifications, keyboard shortcuts)
- Real-time streaming visibility into agent reasoning and tool usage
- Offline-tolerant operation for unreliable network environments
- Secure local credential storage via OS-level encryption
- Background agent monitoring without a browser tab
- Voice-based agent interaction via speech-to-text and text-to-speech
- Reusable agent templates for rapid deployment across brands

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
| Voice            | ElevenLabs (STT/TTS)                          |
| Error Tracking   | Sentry (main + renderer processes)            |
| Testing          | Vitest 4 (unit) + Playwright 1.58 (E2E)       |

### 1.4 Codebase Metrics

| Metric               | Value                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Total TypeScript LOC | ~37,500                                                                                          |
| Pages                | 12 (10 authenticated + login + register)                                                         |
| Feature Modules      | 8 (agent-console, dashboard, connections, webhooks, templates, settings, chat-playground, voice) |
| Shared Components    | 48                                                                                               |
| Custom Hooks         | 27                                                                                               |
| Zustand Stores       | 6                                                                                                |
| Test Files           | 78                                                                                               |
| E2E Test Projects    | 4                                                                                                |

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
│  │  - Notifications │              │  │  - Voice (STT/TTS│  │  │
│  └──────────────────┘              │  └──────────────────┘  │  │
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
                               └───────────┬───────────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   ┌──────────┐    ┌──────────┐    ┌──────────┐
                   │ Shopify  │    │ Gorgias  │    │ Zendesk  │
                   │ API      │    │ API      │    │ API      │
                   └──────────┘    └──────────┘    └──────────┘
```

### 2.2 Process Isolation Model

Electron enforces strict process separation:

- **Main Process** — Privileged Node.js process managing windows, system tray, auto-updates, OAuth HTTP servers, and encrypted credential storage. No direct renderer access.
- **Preload Script** — A narrow bridge exposing 30+ typed IPC methods via `contextBridge.exposeInMainWorld()`. Every method maps to a validated `ipcRenderer.invoke()` call.
- **Renderer Process** — Sandboxed Chromium instance running the React application. No Node.js APIs, no `require()`, no filesystem access. All system interactions route through the preload bridge.

### 2.3 Directory Organization

The codebase follows a feature-based modular structure:

```
stateset-desktop/
├── electron/                 # Main process
│   ├── main.ts              # Window/tray/auth/oauth/updates (1,359 lines)
│   ├── preload.ts           # Secure IPC bridge (30+ methods)
│   ├── url-security.ts      # Navigation/popup URL validation
│   ├── sanitization.ts      # Sentry data redaction
│   └── oauth/               # Provider-specific OAuth flows
│       ├── shopify.ts       # Shopify OAuth + HMAC verification
│       ├── gorgias.ts       # Gorgias OAuth
│       ├── zendesk.ts       # Zendesk OAuth
│       └── utils.ts         # Shared OAuth server utilities
├── src/                      # React renderer
│   ├── pages/               # 12 route-level components
│   ├── features/            # 8 feature modules with co-located code
│   │   ├── agent-console/   # SSE streaming, message rendering, metrics
│   │   ├── dashboard/       # Session list, stats, activity timeline
│   │   ├── connections/     # OAuth integrations, MCP server config
│   │   ├── chat-playground/ # Interactive agent chat testing
│   │   ├── webhooks/        # Webhook CRUD and delivery tracking
│   │   ├── templates/       # Agent template management
│   │   └── settings/        # 7 settings subsections
│   ├── components/          # 48 shared UI components
│   ├── hooks/               # 27 shared React hooks
│   ├── stores/              # 6 Zustand state stores
│   ├── lib/                 # Core utilities (API, schemas, metrics, cache, errors)
│   │   └── voice/           # ElevenLabs STT/TTS integration
│   ├── config/              # Centralized configuration
│   └── types/               # TypeScript type definitions
├── e2e/                      # Playwright E2E tests (4 projects)
├── docs/                     # Architecture, API alignment, auth spec
└── package.json             # Dependencies, scripts, build config
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

### 3.5 IPC Handler Architecture

The main process registers 22 validated IPC handlers organized by domain:

| Domain            | Handlers                                             |
| ----------------- | ---------------------------------------------------- |
| **Store**         | `get`, `set`, `delete` (22-key allowlist)            |
| **OAuth**         | Shopify, Gorgias, Zendesk authorization flows        |
| **Auth**          | `setApiKey`, `getApiKey`, `hasApiKey`, `clearApiKey` |
| **Secrets**       | Secure credential storage via `safeStorage`          |
| **Window**        | Minimize, maximize, close, full-screen               |
| **Notifications** | System notification dispatch                         |
| **App**           | Version, platform info, dev tools                    |
| **Background**    | Agent status reporting to tray                       |
| **Updates**       | Check, download, install triggers                    |

All store operations validate keys against a static allowlist. API key inputs are capped at 4,096 characters. Secret values are limited to 10MB with serialization verification.

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
| `/settings`         | Settings       | Application preferences (7 subsections)     |
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
  /* ... */
}
/* + green, amber, rose, cyan */
:root[data-compact='true'] {
  font-size: 15px;
}
:root[data-reduce-motion='true'] {
  --ui-transition-speed: 0.001ms;
}
```

Six accent colors and two base themes produce 12 visual combinations. The `data-reduce-motion` attribute respects accessibility preferences by collapsing all transitions. Tailwind utilities reference brand colors via CSS variable indirection (`text-brand-500`, `bg-brand-600`), using `color-mix()` for opacity modifiers since `@apply` with CSS variable-based color opacity (e.g., `bg-brand-600/20`) fails in Tailwind.

### 4.5 Accessibility

The application implements comprehensive accessibility support:

- **Semantic HTML** — Proper use of `<nav>`, `<main>`, `<aside>`, ARIA roles and labels
- **Skip link** — "Skip to content" link for keyboard users
- **Focus management** — `useFocusTrap()` for modals, `useAutoFocus()` for form fields
- **Keyboard navigation** — Full list navigation (`useListKeyboardNavigation`) with arrow keys, Home/End, multi-select via Shift/Ctrl, and Enter/Space activation
- **Screen reader support** — ARIA attributes on all interactive elements
- **Reduced motion** — Respects `prefers-reduced-motion` and user preference
- **E2E testing** — Dedicated Playwright accessibility suite using axe-core

### 4.6 Keyboard Shortcuts

| Shortcut           | Action                          |
| ------------------ | ------------------------------- |
| `Cmd/Ctrl+K`       | Open command palette            |
| `Cmd/Ctrl+F`       | Search messages (Agent Console) |
| `Cmd/Ctrl+E`       | Export conversation             |
| `Cmd/Ctrl+Shift+L` | Toggle logs panel               |
| `Escape`           | Close modals, dismiss search    |
| Arrow keys         | Navigate lists, command palette |
| `Enter/Space`      | Activate selected item          |

---

## 5. Data Model & Type System

### 5.1 Core Domain Types

The application is built around a strongly-typed domain model defined in `src/types/index.ts`:

**Agent Session** — The primary entity representing a running AI agent:

```typescript
interface AgentSession {
  id: string;
  tenant_id: string;
  brand_id: string;
  agent_type: string;
  name?: string | null;
  tags?: string[] | null;
  status: AgentSessionStatus; // starting | running | paused | stopping | stopped | failed
  config: AgentSessionConfig;
  metrics: AgentSessionMetrics;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  stopped_at?: string | null;
}
```

**Agent Configuration** — Runtime parameters controlling agent behavior:

```typescript
interface AgentSessionConfig {
  agent_type?: string;
  loop_interval_ms: number; // Iteration frequency (≤100ms = manual mode)
  max_iterations: number; // Safety cap on loop count
  iteration_timeout_secs: number; // Per-iteration timeout
  pause_on_error: boolean; // Auto-pause on failure
  custom_instructions?: string; // Operator-defined system prompt
  mcp_servers: string[] | null; // Model Context Protocol servers
  model: string; // LLM model identifier
  temperature: number; // Sampling temperature
  sandbox_api_key?: string; // Isolated execution key
}
```

**Session Metrics** — Real-time performance counters:

```typescript
interface AgentSessionMetrics {
  loop_count: number;
  tokens_used: number;
  tool_calls: number;
  errors: number;
  messages_sent: number;
  uptime_seconds: number;
  estimated_cost_cents?: number;
  input_tokens?: number;
  output_tokens?: number;
}
```

### 5.2 Multi-Tenant Hierarchy

```
Tenant (organization)
  └── Brand (customer-facing entity)
        ├── Agent Sessions (running AI agents)
        ├── Platform Connections (Shopify, Gorgias, Zendesk, ...)
        └── Webhooks (event subscriptions)
```

Each tenant contains one or more brands. Brands isolate agent sessions, platform credentials, and webhook configurations. Operators switch brands via a sidebar dropdown, and the selection is persisted to preferences.

### 5.3 Event Types (SSE)

The streaming protocol defines nine event types:

| Event            | Key Fields                                                  | Purpose                    |
| ---------------- | ----------------------------------------------------------- | -------------------------- |
| `status_changed` | `status`, `message`                                         | Agent state transitions    |
| `thinking`       | `content`                                                   | Agent reasoning visibility |
| `message`        | `id`, `role`, `content`                                     | User/assistant messages    |
| `tool_call`      | `id`, `tool_name`, `arguments`                              | Tool invocation            |
| `tool_result`    | `tool_call_id`, `result`, `success`, `duration_ms`          | Tool execution output      |
| `log`            | `level`, `message`, `metadata`                              | Operational logging        |
| `error`          | `code`, `message`, `recoverable`                            | Error reporting            |
| `metrics`        | `loop_count`, `tokens_used`, `tool_calls`, `uptime_seconds` | Performance counters       |
| `heartbeat`      | `timestamp`                                                 | Connection keepalive       |

### 5.4 Schema Validation

All API responses are validated at the boundary using Zod schemas (`src/lib/schemas.ts`) before entering the application:

```typescript
const session = validateResponse(AgentSessionSchema, rawData);
```

Schemas use `.passthrough()` for forward compatibility — unknown fields from newer API versions are preserved, not rejected. Built-in transforms handle data normalization (e.g., computing webhook delivery `success` from `response_status`, stringifying nested payloads). The `unwrapDataEnvelope()` utility normalizes the engine's `{ok, data: T}` wrapper format.

### 5.5 API Response Envelope

All engine API responses follow a consistent envelope:

```typescript
interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

The API client unwraps this envelope automatically, surfacing the inner `data` value to callers and converting `error` strings to structured error objects.

---

## 6. API Client & Resilience Layer

### 6.1 Request Pipeline

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
           │    ├─ Exponential backoff: 1s × 2^attempt + jitter (25%)
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

### 6.2 Configuration

All API behavior is governed by a centralized configuration (`src/config/api.config.ts`):

```typescript
const API_CONFIG = {
  baseUrl: 'https://engine.stateset.cloud.stateset.app',
  timeout: 15000,
  maxRetries: 3,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  circuitBreaker: {
    maxFailures: 5,
    halfOpenTimeout: 30000,
    resetTimeout: 60000,
  },
  stream: {
    maxEvents: 500,
    maxMessages: 500,
    maxReconnectAttempts: 12,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000,
  },
};
```

### 6.3 Circuit Breaker

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

Configuration: 5 failures to open, 30-second half-open timeout, 60-second failure count reset. State changes are observable via callbacks for UI integration (the `ApiHealthIndicator` component renders a colored dot reflecting circuit state).

### 6.4 Request Deduplication

Concurrent identical GET requests share a single in-flight promise. The deduplicator uses a `method:path:params` cache key with a 100ms TTL and a maximum of 100 entries. This prevents redundant network calls during rapid component remounting or React Query background refetches.

### 6.5 Fallback Endpoint Resolution

For API endpoints undergoing versioning or path migration, the client supports multi-path fallback:

```typescript
fetchWithFallbackPaths([
  `/api/v1/tenants/${tenant}/brands/${brand}/agents`,
  `/api/v1/tenants/${tenant}/agents`,
  `/api/v1/agents`,
]);
```

Each path is attempted in order. The first successful response is used. This provides forward compatibility during API evolution without client-side coordination.

### 6.6 Auth Header Strategy

The API client supports multiple authentication header formats to accommodate different backend configurations:

1. **ApiKey** — `Authorization: ApiKey <key>` (primary)
2. **Bearer** — `Authorization: Bearer <key>` (fallback)
3. **X-API-Key** — Custom header (legacy support)

The format is selected based on server requirements, with the client cycling through candidates until one succeeds.

---

## 7. Real-Time Streaming

### 7.1 SSE Architecture

Agent sessions emit real-time events via Server-Sent Events. The `useAgentStream()` hook manages the full lifecycle:

```
Agent Console mounts
  │
  ├─ useAgentStream(sessionId) initializes
  │    ├─ Selects auth method (stream token → API key header → query param)
  │    ├─ Opens EventSource to /api/v1/.../agents/:id/stream
  │    └─ Registers event handlers for all 9 event types
  │
  ├─ Events arrive
  │    ├─ Parsed → deduplicated by event ID
  │    ├─ Status changes → update session status
  │    ├─ Messages → append to message list (capped at 500)
  │    ├─ Metrics → update counters (loop_count, tokens, cost)
  │    ├─ Tool calls/results → render in message timeline
  │    └─ Heartbeats → reset connection timeout
  │
  ├─ Connection lost
  │    ├─ Exponential backoff: 1s × 2^attempt + 25% jitter
  │    ├─ Max 12 reconnection attempts
  │    └─ Immediate reconnect on navigator.onLine change
  │
  └─ Agent Console unmounts → close EventSource, clear timers
```

### 7.2 Connection Management

The streaming client implements robust reconnection:

- **Auth cascade** — Tries stream token, then API key header, then API key query parameter
- **Exponential backoff** — 1s base, 2x multiplier, 30s ceiling, 25% jitter
- **Max reconnects** — 12 attempts before giving up
- **Online detection** — Triggers immediate reconnect on `navigator.onLine` change
- **Buffer management** — Events capped at 500, messages at 500 to bound memory
- **Typing indicator** — Auto-cleared after 30 seconds of inactivity
- **Deduplication** — Events deduplicated by ID to handle reconnection replays

### 7.3 Manual vs. Autonomous Mode

Agent sessions support two interaction modes based on `loop_interval_ms`:

- **Autonomous mode** (`loop_interval_ms > 100`) — Agent iterates automatically at the configured interval. The console displays a continuous stream of events.
- **Manual mode** (`loop_interval_ms ≤ 100`) — Agent pauses after each iteration, waiting for operator input. The message input shows a "Send" button, and the operator drives the conversation turn-by-turn.

The threshold is defined as `MANUAL_LOOP_INTERVAL_THRESHOLD_MS = 100` in the agent console constants.

### 7.4 Agent Console UI

The `AgentConsole` page provides a rich interface for agent interaction:

- **Message stream** — Scrollable message list with auto-scroll (500px threshold) and manual scroll lock
- **Message search** — `Cmd/Ctrl+F` to search within the message history
- **Tool call visualization** — Expandable tool call/result pairs with syntax highlighting
- **Metrics panel** — Live counters for tokens, tool calls, loop iterations, cost, and uptime
- **Configuration modal** — Runtime agent parameter adjustment (model, temperature, instructions, MCP servers)
- **Agent toolbar** — Status badge, start/pause/stop controls, export, clone, log replay
- **Export** — Conversation export to Markdown format
- **Approval dialog** — Human-in-the-loop approval for sensitive agent actions
- **Session cloning** — Duplicate an agent session with its current configuration
- **Log replay** — IndexedDB-backed log cache for replaying past session events

---

## 8. State Management

### 8.1 Dual-Layer Architecture

State is partitioned into two layers based on data ownership:

**Server State (React Query):**

- Agent sessions, brands, webhooks, connections, analytics
- Automatic background refetch on window focus
- Configurable polling intervals (5s default for sessions)
- Cache invalidation tied to mutations
- Query key factory (`queryKeys.ts`) ensures consistent cache addressing

**Client State (Zustand):**

| Store              | Purpose                              | Persistence                 |
| ------------------ | ------------------------------------ | --------------------------- |
| `auth.ts`          | API keys, tenant, brand, auth state  | `safeStorage` (OS keychain) |
| `preferences.ts`   | Theme, accent, compact, motion, etc. | `electron-store`            |
| `ui.ts`            | Command palette state                | In-memory                   |
| `notifications.ts` | Toast queue, notification inbox      | `electron-store`            |
| `auditLog.ts`      | Operator action trail (500 cap)      | `electron-store`            |
| `templates.ts`     | Custom agent templates               | `electron-store`            |

### 8.2 Preferences Model

The preferences store exposes a comprehensive set of operator controls:

```typescript
{
  theme: 'dark' | 'light',
  accentColor: 'blue' | 'purple' | 'green' | 'amber' | 'rose' | 'cyan',
  reduceMotion: boolean,
  compactMode: boolean,
  telemetryEnabled: boolean,
  minimizeToTray: boolean,
  autoStartAgentsOnLaunch: boolean,
  desktopNotifications: boolean,
  soundAlerts: boolean,
  refreshInterval: 5000 | 10000 | 30000 | 60000,
  pageSize: 10 | 25 | 50 | 100,
}
```

### 8.3 Optimistic Mutations

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

### 8.4 Persistence Strategy

| Store            | Backend                | Encryption                                |
| ---------------- | ---------------------- | ----------------------------------------- |
| API keys         | Electron `safeStorage` | OS keychain (Keychain/Credential Manager) |
| Preferences      | `electron-store`       | Optional (AES with env key)               |
| Audit log        | `electron-store`       | Optional                                  |
| Custom templates | `electron-store`       | Optional                                  |
| Offline cache    | IndexedDB              | None (non-sensitive data)                 |
| Chat history     | LocalStorage           | None                                      |
| Voice settings   | LocalStorage           | None                                      |
| Session UI state | In-memory              | N/A                                       |

All Electron store operations are gated through a 22-key allowlist. Writes to unknown keys are rejected at the IPC handler level.

---

## 9. Security Architecture

### 9.1 Defense in Depth

Security is enforced at multiple layers:

**Process Level:**

- Context isolation between main and renderer
- Sandboxed renderer with no Node.js access
- Single-instance lock prevents duplicate processes

**Network Level:**

- Content Security Policy restricting script, connect, and frame sources
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`
- URL allowlist for external navigation (only `*.stateset.dev`, `github.com`, `*.stateset.io`, configured API hosts)
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

### 9.2 Permission Model

Browser permissions are strictly controlled:

| Permission        | Policy                               |
| ----------------- | ------------------------------------ |
| `clipboard-read`  | Allowed                              |
| `clipboard-write` | Allowed                              |
| `media` (audio)   | Allowed (self-origin only, no video) |
| All others        | Denied                               |

### 9.3 Content Security Policy

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

### 9.4 CORS Header Injection

The main process intercepts outbound API requests and injects CORS headers on responses. This allows the sandboxed renderer to communicate with the StateSet Engine API without requiring the server to handle browser CORS preflight for all endpoints. Origin validation ensures only expected hosts are whitelisted.

---

## 10. Offline Resilience & Caching

### 10.1 Offline Cache (IndexedDB)

The application maintains an IndexedDB cache (`src/lib/cache.ts`) for critical entity types:

- **Sessions** — Agent session list for dashboard rendering
- **Brands** — Brand configuration for multi-brand switching
- **Connections** — Platform integration status
- **Auth Context** — Cached tenant, brand, and credential data

Each cache entry carries a TTL. The `useOfflineCache()` hook family provides transparent cache-then-network semantics:

```
Query fires → Network available?
  ├─ Yes → Fetch from API, cache result
  └─ No  → Return cached data, show offline banner
```

### 10.2 Auth Resilience

The auth store handles network failures during initialization:

1. Attempt to validate stored API key against `/api/v1/auth/me`
2. If network error → Accept cached credentials and allow offline operation
3. If 401/403 → Clear stored key, redirect to login
4. If 5xx → Accept provided auth data as fallback

### 10.3 Health Monitoring

The `useOnlineStatus()` hook provides multi-dimensional health assessment:

- **Connectivity** — `navigator.onLine` + periodic health endpoint checks
- **API reachability** — Latency measurement against `/health`
- **Component health** — Database, NATS, Redis status from `/api/v1/health/detailed`
- **Circuit breaker state** — Both server-side and client-side circuit states
- **Retry logic** — Exponential backoff for health checks (30s base, 2min ceiling)

The `ApiHealthIndicator` component renders a colored dot reflecting the composite health state, with tooltip details showing individual component statuses.

---

## 11. Platform Integrations & OAuth

### 11.1 Supported Platforms

StateSet Desktop supports integrations with 10 customer service and e-commerce platforms:

| Platform       | Auth Method | Key Capabilities                          |
| -------------- | ----------- | ----------------------------------------- |
| **Shopify**    | OAuth 2.0   | Orders, customers, products, fulfillments |
| **Gorgias**    | OAuth 2.0   | Tickets, customers, account info          |
| **Zendesk**    | OAuth 2.0   | Tickets, users, read/write access         |
| **Recharge**   | API Key     | Subscription management                   |
| **Klaviyo**    | API Key     | Email/SMS marketing automation            |
| **Make**       | API Key     | Workflow automation                       |
| **N8N**        | API Key     | Workflow automation                       |
| **Zapier**     | API Key     | Integration automation                    |
| **Custom MCP** | Manual      | Arbitrary Model Context Protocol servers  |

### 11.2 OAuth 2.0 Flow

Each OAuth integration follows a secure authorization code flow:

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

**OAuth Port Assignments:**

| Provider | Port |
| -------- | ---- |
| Shopify  | 8234 |
| Gorgias  | 8235 |
| Zendesk  | 8236 |

**Security measures:**

- State parameter validation prevents CSRF attacks
- Authorization code length capped at 2,048 characters
- Domain validation (regex) for Shopify stores and Gorgias/Zendesk subdomains
- Timing-safe HMAC-SHA256 verification for Shopify callbacks
- 5-minute timeout on the OAuth window
- Client credentials auto-cleared from environment in production
- Port scanning with fallback via `findAvailableOAuthPort()`

### 11.3 MCP Server Support

Beyond OAuth integrations, the Connections page supports custom MCP (Model Context Protocol) server configuration, allowing agents to connect to arbitrary tool servers for extended capabilities. MCP servers are configured per-brand and stored in the brand's `mcp_servers` array.

### 11.4 Credential Storage Modes

Platform credentials support two storage modes:

- **Local** — Encrypted via `safeStorage` on the operator's machine. Credentials never leave the device.
- **Vault** — Stored server-side via the StateSet Engine API's secrets endpoint. Enables credential sharing across multiple desktop instances.

---

## 12. Voice Interface

### 12.1 Architecture

The Voice page (`src/pages/Voice.tsx`) provides a complete voice-based agent interaction interface built on ElevenLabs:

```
Operator speaks → Browser MediaRecorder API
  → Audio blob → ElevenLabs STT API
  → Transcription text → StateSet Engine API (agent chat)
  → Agent response text → ElevenLabs TTS API
  → Audio playback → Browser Audio API
```

### 12.2 Speech-to-Text (STT)

- ElevenLabs Speech-to-Text API with configurable model selection
- Browser `MediaRecorder` for audio capture
- Visual recording indicator with waveform animation
- Auto-send transcription to agent on recording stop

### 12.3 Text-to-Speech (TTS)

- ElevenLabs TTS API with configurable voice selection
- Auto-speak toggle for hands-free operation
- Barge-in support — operator can interrupt the assistant's speech by starting a new recording
- Voice settings persisted to LocalStorage

### 12.4 Conversation Focus

The voice interface supports three operational focus modes that shape the agent's system prompt:

| Focus          | Use Case                                    |
| -------------- | ------------------------------------------- |
| **Support**    | Customer service, ticket triage, escalation |
| **Operations** | Order management, inventory, fulfillment    |
| **Growth**     | Marketing, retention, customer engagement   |

Each focus provides context-appropriate quick action prompts for rapid interaction.

### 12.5 Response Depth

Operators can control response verbosity:

- **Concise** — Brief, actionable responses
- **Balanced** — Standard detail level (default)
- **Detailed** — Comprehensive analysis and explanation

### 12.6 Conversation Memory

The voice interface maintains the last 40 messages in memory, providing context continuity across turns without unbounded memory growth.

---

## 13. Agent Templates & Configuration

### 13.1 Template System

Agent templates provide reusable configurations for rapid deployment:

```typescript
interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: 'general' | 'support' | 'commerce' | 'automation' | 'custom';
  agentType: string;
  config: Partial<AgentSessionConfig>;
  isCustom?: boolean;
  createdAt?: string;
}
```

### 13.2 Built-in Templates

The application ships with pre-built templates for common use cases:

- **Customer Support Agent** — Ticket triage, response drafting, escalation routing
- **E-commerce Agent** — Order lookup, return processing, inventory queries
- **Automation Agent** — Workflow execution, data synchronization, webhook handling

### 13.3 Custom Templates

Operators can create custom templates from any agent configuration:

1. Configure an agent session (model, temperature, instructions, MCP servers)
2. Save as template via the `SaveAsTemplateDialog`
3. Template stored in the templates Zustand store, persisted to `electron-store`
4. Available for future agent creation via the `TemplatePicker`

Templates are organized by category with search and filtering support.

### 13.4 Agent Creation Flow

Creating a new agent session follows this flow:

```
Dashboard → "New Agent" button → CreateAgentDialog
  ├─ Select template (or start from scratch)
  ├─ Configure: name, model, temperature, instructions
  ├─ Optional: attach MCP servers
  ├─ Optional: set sandbox API key for isolated execution
  └─ Submit → POST /api/v1/.../agents → New session created
```

---

## 14. Observability & Diagnostics

### 14.1 Structured Logging

The logging system (`src/lib/logger.ts`) provides:

- **JSON output** in production, human-readable format in development
- **Session correlation** — Unique session ID included in all log entries
- **Scoped loggers** — `apiLogger`, `authLogger`, `agentLogger` with automatic context prefixes
- **Sensitive data masking** — API keys, tokens, passwords redacted before output
- **Performance timing** — `log.time()` for measuring async operations
- **Buffer** — Last 1,000 entries retained for export and debugging
- **Test suppression** — Logging disabled in test environment

### 14.2 Request Metrics

The metrics module (`src/lib/metrics.ts`) maintains a rolling window of the last 500 API calls and computes:

- **Latency percentiles** — p50, p95, p99
- **Error rate** — Percentage of 4xx/5xx responses
- **Cache hit rate** — Request deduplication effectiveness
- **Total retries** — Aggregate retry count across all calls
- **Circuit breaker trips** — Count of CLOSED→OPEN transitions

These metrics feed into the Analytics page (with charts for token usage over time, tool calls by agent, status distribution, and token type breakdown) and the `MetricsPanel` component in the Agent Console.

### 14.3 Analytics Dashboard

The Analytics page (`src/pages/Analytics.tsx`) provides eight key metric cards and four visualization charts:

| Metric Card          | Description                  |
| -------------------- | ---------------------------- |
| Total Agents         | Count of all agent sessions  |
| Running Agents       | Currently active sessions    |
| Total Tokens         | Aggregate token consumption  |
| Total Tool Calls     | Aggregate tool invocations   |
| Total Loops          | Aggregate iteration count    |
| Total Errors         | Aggregate error count        |
| Avg Tokens/Agent     | Mean token usage per session |
| Avg Tool Calls/Agent | Mean tool calls per session  |

Charts support a configurable date range (default: last 7 days) with an agent performance summary table.

### 14.4 Audit Trail

The audit log store records operator actions with structured metadata:

- Agent start/stop/pause/resume events
- Brand switching
- Template creation and deletion
- Configuration changes
- OAuth connection events

Entries are capped at 500, persisted to Electron store, and viewable in the Audit Log page with filtering, search, and pagination.

### 14.5 Error Tracking

Sentry integration spans both processes:

- **Main process** — Captures uncaught exceptions, unhandled rejections, and updater errors
- **Renderer process** — Captures React errors, API failures, and stream disconnections
- **Sanitization** — All events pass through a multi-pattern redactor before transmission, removing API keys, tokens, JWTs, emails, and cloud credentials

### 14.6 Error Classification

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

## 15. Testing Strategy

### 15.1 Test Pyramid

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

### 15.2 Unit & Component Testing

**Framework:** Vitest 4.0 with happy-dom (jsdom avoided due to webidl-conversions crash)

**Coverage:** 78 test files across all application layers:

| Layer      | Files | Scope                                                         |
| ---------- | ----- | ------------------------------------------------------------- |
| Libraries  | 21    | API client, schemas, circuit breaker, metrics, cache, errors  |
| Components | 15    | Modal, Button, Dropdown, Pagination, ErrorBoundary            |
| Pages      | 11    | Login, Dashboard, AgentConsole, Settings, Analytics           |
| Hooks      | 10    | useErrorHandler, useOptimisticSessionMutation, useAgentStream |
| Stores     | 6     | auth, preferences, notifications, auditLog, ui, templates     |
| Features   | 8     | agent-console, webhooks, chat-playground, connections         |

**Test Environment:**

- Component and page tests require `/** @vitest-environment happy-dom */` directive
- Store tests (auditLog, notifications) run in node environment using `mockElectronStore()` pattern
- Settings.tsx uses named imports for sub-components — mocks must match

**Test Utilities:**

- `renderWithProviders()` — Wraps components in QueryClient, Router, and ToastProvider
- `mockElectronAPI()` — Type-safe mock of the Electron preload bridge
- Custom mock patterns for Zustand stores and React Query

### 15.3 End-to-End Testing

**Framework:** Playwright 1.58 with four test projects:

| Project         | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `electron`      | App lifecycle, IPC communication, window management |
| `visual`        | Screenshot comparison with 2% diff tolerance        |
| `accessibility` | WCAG compliance via axe-core                        |
| `integration`   | Cross-feature user flows                            |

Configuration: 60-second test timeout, 2 retries in CI, single worker for visual consistency, video/trace capture on failure.

### 15.4 Code Quality Gates

- **ESLint** — Zero-warning policy with TypeScript and React hooks rules
- **Prettier** — Consistent formatting (single quotes, trailing commas, 100-char width)
- **TypeScript** — Strict mode with `noEmit` type checking
- **Pre-commit hooks** — Husky + lint-staged runs ESLint fix and Prettier on staged files
- **CI pipeline** — Lint → Typecheck → Unit tests → E2E → Build (all must pass)

---

## 16. Build & Distribution

### 16.1 Build Pipeline

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

### 16.2 Platform Artifacts

| Platform                      | Formats                  | Code Signing                   |
| ----------------------------- | ------------------------ | ------------------------------ |
| macOS (Intel + Apple Silicon) | DMG, ZIP                 | Hardened runtime, team signing |
| Windows (x64, arm64)          | NSIS installer, portable | SHA-256 certificate            |
| Linux (x64)                   | AppImage, .deb           | N/A                            |

### 16.3 Auto-Update Distribution

- **macOS & Windows** — `electron-updater` checks GitHub Releases for `latest-mac.yml` / `latest.yml` manifests
- **Linux** — Auto-update supported only for AppImage format
- **Blockmap files** — Differential updates reduce download size for incremental releases

### 16.4 Vite Code Splitting

The Vite build produces optimized chunks via manual splitting:

| Chunk          | Contents                       |
| -------------- | ------------------------------ |
| `react-vendor` | React, React DOM, React Router |
| `ui-vendor`    | Framer Motion, Lucide icons    |
| `data-vendor`  | React Query, Zustand, date-fns |

This ensures vendor code is cached independently from application code, minimizing update payload for operators.

### 16.5 Runtime Requirements

| Requirement        | Value        |
| ------------------ | ------------ |
| Node.js            | ≥22.12.0     |
| npm                | 10.9.3       |
| Runtime deps       | 65           |
| Dev deps           | 61           |
| Electron           | 35.7.5       |
| Chromium (bundled) | Per Electron |

---

## 17. Future Architecture Considerations

While the current architecture is production-hardened, several areas present opportunities for further improvement as the platform scales.

### 17.1 Main-Process SSE Streaming

**Problem:** The SSE streaming connection (`useAgentStream`) lives in the Renderer process. Chromium aggressively throttles background renderers — timers, network streams, and `requestAnimationFrame` are deprioritized when a window is hidden or minimized to the system tray. This directly conflicts with the goal of background agent monitoring (Section 1.1).

**Recommendation:** Migrate the SSE connection layer to the Node.js Main Process, which is never subject to Chromium's background throttling. The main process would maintain persistent SSE connections, buffer events, and forward rate-limited updates to the renderer via IPC when the window is active. When the window is hidden, the main process triggers native OS notifications directly. This also enables a future where agents continue operating with full visibility even when the renderer is suspended.

### 17.2 Custom Protocol Handler for OAuth

**Problem:** OAuth flows rely on fixed local HTTP servers bound to ports 8234–8236 (Section 11.2). In enterprise environments, these ports may be blocked by corporate firewalls, VPN clients (e.g., Zscaler), or conflict with other developer tools — causing OAuth to fail silently.

**Recommendation:** Register a custom protocol handler via `app.setAsDefaultProtocolClient('stateset')` and use `stateset://oauth/callback` as the redirect URI. This eliminates port conflicts entirely, avoids firewall issues, and is the canonical Electron pattern for OAuth. The local HTTP servers can be retained as a fallback for providers that do not support custom schemes.

### 17.3 Event Stream Memory Management

**Problem:** The SSE event buffer is capped at 500 events and 500 messages (Section 7.2). For long-running agent sessions, holding hundreds of deeply nested JSON objects in the React component tree creates GC pressure and potential UI stutter during garbage collection pauses.

**Recommendation:** Implement a tiered storage strategy: keep only the most recent N events (e.g., 200) in React state for rendering, and persist the full event history to IndexedDB or a local SQLite database (accessible via the main process). Pair this with virtual scrolling (`@tanstack/react-virtual`) in the Agent Console so that older events are paged into memory only when the operator scrolls upward. This bounds memory usage regardless of session duration.

### 17.4 Integrated Query Persistence

**Problem:** The offline cache (Section 10.1) is implemented as a custom IndexedDB wrapper (`useOfflineCache`) that operates alongside React Query. This creates two parallel caching layers with independent invalidation logic.

**Recommendation:** Replace the custom wrapper with TanStack Query's official `PersistQueryClient` plugin backed by an IndexedDB persister (e.g., `idb-keyval`). This automatically hydrates the React Query cache from disk on startup, eliminates the need for custom cache-then-network fallback logic, and ensures that cache invalidation is governed by a single, well-tested system.

### 17.5 Local AI Fallback for Offline Operation

**Problem:** When the circuit breaker is OPEN or the network is unavailable, operators can view cached data but cannot take any actions — they are effectively locked out of agent interaction.

**Recommendation:** Leverage the desktop runtime to integrate a lightweight local LLM (via `Transformers.js`, Ollama bindings, or `llama.cpp` via a Node.js addon). This would enable basic offline capabilities: drafting customer replies from cached context, summarizing agent session history, or generating configuration suggestions. Actions taken offline would be queued and synced to the backend when connectivity is restored. This transforms the offline experience from read-only to productive.

### 17.6 Multi-Operator Conflict Resolution

**Problem:** Optimistic mutations (Section 8.3) assume a single-operator model. If two operators manage the same agent session or modify the same template concurrently, the last write wins — potentially overwriting another operator's changes without warning.

**Recommendation:** For collaborative resources (templates, agent configurations, webhook settings), consider integrating a CRDT (Conflict-free Replicated Data Type) library such as Yjs or Automerge. CRDTs enable true multiplayer editing by merging concurrent changes deterministically without a central coordinator. For simpler cases, server-side optimistic locking with version vectors (ETags) provides conflict detection without the complexity of full CRDT integration.

### 17.7 Voice Streaming Optimization

**Problem:** The current voice pipeline (Section 12) uses a request-response pattern — the full audio recording is sent to ElevenLabs STT, then the full response is sent to TTS. This introduces perceptible latency between the operator finishing speech and hearing the agent's response.

**Recommendation:** Adopt streaming for both STT and TTS. ElevenLabs supports WebSocket-based streaming for both services. The STT stream can begin transcription while the operator is still speaking, and the TTS stream can begin audio playback as soon as the first response tokens are available. Combined with the SSE agent stream, this creates a fully pipelined voice interaction with sub-second perceived latency.

---

## 18. Conclusion

StateSet Desktop demonstrates that desktop applications remain the right choice for operational tooling where reliability, security, and system integration are paramount. The architecture achieves its design goals through:

- **Resilience** — A four-layer defense (deduplication → retry → circuit breaker → offline cache) ensures operators maintain visibility even during API degradation.
- **Security** — Process isolation, CSP enforcement, IPC allowlisting, and OS-level credential encryption establish a zero-trust boundary between the network and the operator.
- **Performance** — Lazy-loaded routes, virtual scrolling, request deduplication, and optimistic mutations keep the interface responsive under load.
- **Observability** — Structured logging, percentile metrics, circuit breaker visibility, and audit trails make the system transparent to both operators and developers.
- **Quality** — 78 test files, four E2E test projects, strict linting, and type checking enforce correctness across the codebase.
- **Multimodal Interaction** — Text-based agent consoles, voice interfaces with STT/TTS, and a chat playground provide operators with multiple modalities for agent interaction.

The application serves as infrastructure for autonomous agent operations — a control plane where reliability is not a feature but a requirement.

---

_StateSet, Inc. | MIT License | https://github.com/stateset/stateset-desktop_
