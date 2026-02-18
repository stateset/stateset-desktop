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

## Security

- API keys encrypted at rest using Electron `safeStorage`
- Sensitive data sanitized in error reporting
- Content Security Policy enforced in renderer
- OAuth credentials loaded from environment variables (never hardcoded)

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
