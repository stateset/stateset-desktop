# StateSet Desktop Architecture

Architecture documentation for the StateSet Desktop application.

## Overview

```
┌──────────────────┐        ┌──────────────────┐
│   Desktop App    │        │   StateSet API   │
│   (Electron +    │───────▶│                  │
│    React)        │◀───────│                  │
└──────────────────┘  REST  └──────────────────┘
                      + SSE
```

The desktop application is a control plane UI for managing autonomous AI customer service agents. It communicates with the StateSet API over REST and receives real-time updates via Server-Sent Events (SSE).

## Runtime Layers

### 1) Electron Main Process (`electron/main.ts`)

- Owns native window lifecycle (`createWindow()`), tray mode, and app-level events.
- Enforces renderer security boundaries:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - navigation and popup restrictions (`will-navigate`, `setWindowOpenHandler`)
  - production CSP/security header enforcement
- Handles secure secret persistence through Electron `safeStorage`.
- Exposes IPC handlers for:
  - auth key management
  - approved key/value store operations
  - OAuth flow launches
  - notifications, updates, and window controls

### 2) Preload Bridge (`electron/preload.ts`)

- Exposes a constrained `window.electronAPI` object via `contextBridge`.
- Acts as the only renderer-accessible gateway for privileged operations.
- Prevents direct Node.js or arbitrary Electron API access from renderer code.

### 3) Renderer App (`src/main.tsx`, `src/App.tsx`)

- Initializes React, React Query, error boundaries, telemetry, logging.
- Initializes auth + preferences stores on startup.
- Uses protected routing:
  - unauthenticated users -> `/login`
  - authenticated users -> app shell (`Layout`) and feature routes
- Hosts feature pages (`Dashboard`, `AgentConsole`, `Connections`, `Settings`, etc.).

### 4) Engine/Sandbox APIs

- Engine API provides auth, sessions, streaming tokens, webhooks, secrets.
- Sandbox API supports sandbox execution-related features where configured.

## Desktop App

### Tech Stack

| Layer            | Technology                              |
| ---------------- | --------------------------------------- |
| Framework        | Electron + React + Vite + TypeScript    |
| State Management | Zustand + React Query                   |
| Styling          | Tailwind CSS                            |
| API Client       | Native Fetch with retry/circuit breaker |
| Testing          | Vitest + Testing Library + Playwright   |
| Validation       | Zod (runtime schema validation)         |

### Key Files

- `src/lib/api.ts` — API client with retry, circuit breaker, deduplication
- `src/lib/schemas.ts` — Zod schemas for API response validation
- `src/stores/auth.ts` — Authentication state management
- `src/hooks/useAgentStream.ts` — SSE streaming for real-time agent updates
- `src/config/api.config.ts` — API configuration
- `electron/main.ts` — Electron main process, secure credential storage
- `electron/preload.ts` — Secure renderer bridge (`window.electronAPI`)
- `src/hooks/useOfflineCache.ts` + `src/lib/cache.ts` — IndexedDB offline cache flow
- `src/hooks/useBackgroundAgents.ts` — tray sync + background notifications

### Project Structure

```
src/
├── components/        # Shared UI components
├── config/            # App configuration
├── features/          # Feature modules (agent-console, etc.)
│   └── <feature>/
│       ├── components/
│       ├── hooks/
│       ├── constants.ts
│       └── utils.ts
├── hooks/             # Shared React hooks
├── lib/               # Core utilities (API client, schemas, metrics)
├── pages/             # Top-level page components
├── stores/            # Zustand stores
└── types/             # TypeScript type definitions
```

## Startup and Auth Flow

1. Electron app becomes ready (`app.whenReady()` in `electron/main.ts`).
2. `createWindow()` builds secure BrowserWindow and loads dev server or packaged renderer.
3. Preload attaches `window.electronAPI`.
4. Renderer boots (`src/main.tsx`) and mounts `App`.
5. `App` calls:
   - `useAuthStore().initialize()`
   - `usePreferencesStore().initialize()`
6. Auth initialization (`src/stores/auth.ts`) attempts:
   - read stored API key via `electronAPI.auth.getApiKey()`
   - validate key with `GET /api/v1/auth/me`
   - restore tenant, brands, current brand, sandbox key
7. If auth passes, protected routes render in `Layout`; otherwise app redirects to `/login`.

## State and Data Model

### Server State (React Query)

- All network-backed entities (sessions, connections, webhooks, etc.) live in React Query caches.
- Query keys are centralized in `src/lib/queryKeys.ts`.
- Mutations invalidate/refetch affected keys after writes.

### Client/App State (Zustand)

- `src/stores/auth.ts`: credentials, tenant, brand selection, auth lifecycle.
- `src/stores/preferences.ts`: UX preferences and behavior settings.
- `src/stores/ui.ts`: command palette and lightweight global UI state.
- Additional stores manage notifications/audit/template slices.

### Local Persistence

- Secure credentials: Electron `safeStorage` (main process).
- Non-sensitive preferences/state: `electron-store` allowlisted keys.
- Offline entity cache: IndexedDB with TTL (`src/lib/cache.ts`).

## API Request Pipeline

All REST calls run through `apiRequest()` in `src/lib/api.ts`.

Pipeline behavior:

1. Build auth headers from active auth state.
2. Enforce timeout and retry with exponential backoff for retryable failures.
3. Apply circuit breaker protections to avoid repeated cascading failures.
4. Deduplicate concurrent identical safe reads (`GET`, `HEAD`, `OPTIONS`).
5. Validate response shape with Zod schemas.
6. Record metrics and emit structured logging.

## Request Lifecycle Trace: Start Agent and Stream

This is the end-to-end path for pressing **Start** on Dashboard and then observing live agent output.

1. UI action occurs in `src/pages/Dashboard.tsx`.
2. Start mutation uses optimistic state (`useOptimisticSessionMutation`) so row status updates immediately.
3. Mutation calls `agentApi.startSession(tenantId, brandId, sessionId)`.
4. `agentApi.startSession` issues `POST /api/v1/tenants/:tenantId/brands/:brandId/agents/:sessionId/start`.
5. `apiRequest()` applies timeout/retry/circuit-breaker + metrics instrumentation.
6. On success, React Query invalidates sessions and refetches canonical state.
7. Session status transitions to running in refreshed query data.
8. Agent Console (`src/pages/AgentConsole.tsx`) uses `useAgentStream()` to connect to SSE endpoint.
9. Stream events are parsed and normalized in `src/hooks/useAgentStream.ts`.
10. Message timeline, metrics, logs, typing indicators, and status badges update in real time.
11. Background management (`src/hooks/useBackgroundAgents.ts`) updates tray counts and optional notifications.

## Request Lifecycle Trace: Health and Connectivity

Connectivity/health indicator flow (`src/hooks/useOnlineStatus.ts`):

1. On interval, app checks browser online state (`navigator.onLine`).
2. Performs `GET /health` with request timeout to validate reachability and latency.
3. If authenticated, follows with `GET /health/detailed` for component-level status.
4. Updates UI health state:
   - API reachable or not
   - component statuses (`database`, `redis`, `nats`)
   - server circuit-breaker states
   - local circuit-breaker state from client API layer
5. Applies adaptive retry interval with backoff when failures occur.

## API Integration

The desktop app communicates with the StateSet API. All requests go through the centralized `apiRequest()` client which provides:

- **Automatic retries** with exponential backoff
- **Circuit breaker** to prevent cascading failures
- **Request deduplication** for concurrent identical GET requests
- **Timeout handling** with configurable limits
- **Performance metrics** tracking

### Configuration

API endpoints are configured via environment variables:

```bash
# Primary API endpoint
VITE_API_URL=https://engine.stateset.cloud.stateset.app

# Sandbox API (optional, for code execution features)
VITE_SANDBOX_API_URL=https://api.sandbox.stateset.app
```

See `.env.example` for all available configuration options.

### Authentication

The app authenticates using API keys stored securely via Electron's `safeStorage` encryption:

```
Authorization: ApiKey sk-xxxxxxxxxxxxxxxxxxxxx
```

### Real-Time Updates

Agent activity is streamed to the desktop app via SSE:

```typescript
type AgentEventType =
  | 'status_changed' // Agent status updates
  | 'thinking' // Agent reasoning
  | 'message' // Chat messages
  | 'tool_call' // Tool invocation
  | 'tool_result' // Tool execution results
  | 'error' // Error events
  | 'metrics' // Performance metrics
  | 'heartbeat'; // Keep-alive ping
```

## Desktop Engine Contract (Verified February 27, 2026)

This section documents the runtime contract between desktop and
`stateset-orchestration-engine`, including compatibility handling for known payload variants.

### Route + Auth Summary

| Category  | Desktop Route Usage                                                                                               | Engine Auth Requirement                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Health    | `GET /health`, `GET /api/v1/health/detailed` with fallback `GET /health/detailed` on `404`                        | `/health` is public. `/api/v1/health/detailed` requires API auth scopes (`read/admin/ops/metrics`). |
| Agents    | `GET/POST/PUT/DELETE` under `/api/v1/tenants/:tenant/brands/:brand/agents/*` and `/api/v1/tenants/:tenant/agents` | API auth with tenant + brand authorization checks; write scope required for mutations.              |
| Streaming | `POST /stream/token`, `GET /stream` (SSE)                                                                         | Protected token route + callback auth middleware for SSE stream route.                              |
| Secrets   | `GET/POST/DELETE` and `POST /test` under brand secrets endpoints with tenant/brand fallbacks                      | API auth with read/write scope and tenant-brand ownership checks.                                   |
| Webhooks  | Tenant-scoped list/get/update/delete/test/deliveries plus brand-scoped create                                     | API auth with read/write scope and tenant-brand ownership checks.                                   |
| Auth      | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`                                                         | Register/login are public; `/auth/me` is protected.                                                 |

### Response Envelope Compatibility

Desktop currently normalizes these response variants:

- `{ ok, data: T }` envelope via `unwrapDataEnvelope(...)`
- Direct payloads like `{ ok, webhooks: [...] }` or `{ success, ... }`
- Secrets list variants:
  - `{ ok, platforms: string[] }`
  - `{ ok, data: { platforms: string[] } }`
- Webhook delivery variants:
  - Legacy shape with `payload: string`, `duration_ms`, `success`
  - Canonical engine DB shape with `payload: object`, `response_status`, `attempts`, `delivered_at`
- Webhook test variants:
  - Legacy `{ success, status_code, duration_ms }`
  - Canonical `{ ok, data: WebhookDelivery }` normalized to the legacy shape for UI callers
- Webhook create variants:
  - Full webhook object
  - Minimal create payload (`id/url/events/secret/enabled/created_at`) normalized with tenant/brand/name fallbacks

### Health Parsing Strategy

- Desktop always checks `GET /health` first for reachability.
- For detailed status, desktop prefers `GET /api/v1/health/detailed`.
- If that route returns `404`, desktop falls back to `GET /health/detailed`.
- Detailed payload parsing is defensive:
  - supports top-level and `{ ok, data }` envelope shapes
  - normalizes unknown component statuses to `unknown` (not falsely `unhealthy`)
  - defaults missing circuit breaker fields to `closed`

### Verification Commands

```bash
npm test -- src/lib/api.test.ts src/lib/schemas.test.ts src/hooks/useOnlineStatus.test.ts src/lib/registration.test.ts
npx eslint src/lib/api.ts src/lib/schemas.ts src/hooks/useOnlineStatus.ts src/lib/registration.ts
```

For cross-repo checks against the engine implementation, see `docs/ENGINE_API_ALIGNMENT.md`.

## Security

- API keys encrypted at rest using Electron `safeStorage`
- Sensitive data sanitized in error reporting
- Content Security Policy enforced in renderer
- OAuth credentials loaded from environment variables (never hardcoded)
- Renderer cannot access Node directly; all privileged access goes through preload IPC bridge

## Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## References

- [Environment Variables](./../.env.example)
- [API Client](../src/lib/api.ts)
- [Type Definitions](../src/types/index.ts)
- [Playwright E2E Tests](../e2e/)
