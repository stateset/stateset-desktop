# StateSet Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build](https://github.com/stateset/stateset-desktop/actions/workflows/build-release.yml/badge.svg)](https://github.com/stateset/stateset-desktop/actions/workflows/build-release.yml)
[![Version](https://img.shields.io/github/v/release/stateset/stateset-desktop)](https://github.com/stateset/stateset-desktop/releases)

AI Agent Desktop application for StateSet - manage autonomous customer service agents with real-time streaming UI.

## Features

- **Autonomous AI Agents**: Run AI agents in continuous loops that autonomously handle customer service tasks
- **Real-time Streaming**: SSE-based live updates showing agent thinking, tool calls, and responses
- **Platform Integrations**: OAuth connections for Shopify, Gorgias, Zendesk, and more
- **Multi-brand Support**: Manage multiple brands with separate configurations
- **Loop Control**: Pause, resume, and stop agents at any time
- **Metrics Dashboard**: Track token usage, tool calls, and agent performance

## Architecture

```
┌─────────────────────────────────────────┐
│           Electron Desktop App           │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  Login  │  │Dashboard│  │ Console │  │
│  └─────────┘  └─────────┘  └─────────┘  │
│                    │                     │
│              SSE Stream                  │
└────────────────────┼────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ StateSet Engine API (engine.stateset.cloud.stateset.app) │
│                                         │
│  Agent Sessions → Sandbox Execution     │
│  OAuth → Platform APIs                  │
└─────────────────────────────────────────┘
```

## How It Works

The app runs as three connected layers:

1. **Electron main process** (`electron/main.ts`)
   Creates the desktop window and tray behavior, enforces navigation/security policy, handles secure key storage, and exposes IPC handlers for auth/store/oauth/notifications/updates.
2. **Preload bridge** (`electron/preload.ts`)
   Exposes a minimal `window.electronAPI` surface so the renderer can call approved capabilities without direct Node.js access.
3. **React renderer** (`src/main.tsx` + `src/App.tsx`)
   Boots UI, initializes auth/preferences, and renders protected routes (`Dashboard`, `Agent Console`, `Connections`, `Settings`, etc.) once authenticated.

At runtime:

- Auth state is restored from secure storage and validated with `GET /api/v1/auth/me`.
- API requests flow through `src/lib/api.ts` (retry, timeout, circuit breaker, validation, request dedupe).
- React Query stores server state; Zustand stores app/session UI state.
- Agent console uses SSE (`src/hooks/useAgentStream.ts`) for live event streaming.
- Offline cache (`src/lib/cache.ts`, IndexedDB) provides fallback reads for key lists.

For full details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
For desktop-engine contract details, see [docs/ENGINE_API_ALIGNMENT.md](docs/ENGINE_API_ALIGNMENT.md).

## Request Lifecycle Example: Start Agent & Stream

Example: clicking **Start** for a stopped agent on Dashboard.

1. User clicks start in `Dashboard` (`src/pages/Dashboard.tsx`).
2. `useOptimisticSessionMutation` marks session state as `starting` immediately for responsive UI.
3. Mutation calls `agentApi.startSession(tenantId, brandId, sessionId)` in `src/lib/api.ts`.
4. `agentApi` sends `POST /api/v1/tenants/:tenantId/brands/:brandId/agents/:sessionId/start`.
5. `apiRequest()` handles retry/timeout/circuit-breaker concerns and records metrics.
6. On success, React Query invalidates session queries and refetches canonical state.
7. UI re-renders with updated status (`running`/`paused`) from API.
8. In `Agent Console` (`src/pages/AgentConsole.tsx`), `useAgentStream()` connects to SSE endpoint.
9. SSE events (`thinking`, `message`, `tool_call`, `metrics`, `status_changed`) stream in and update the live timeline + metrics panel.
10. Background sync updates tray status and optionally shows desktop notifications (`src/hooks/useBackgroundAgents.ts`).

## Development

### Prerequisites

- Node.js 22.12+ (see `.nvmrc`)
- npm or yarn

### Setup

1. Clone the repository:

```bash
git clone https://github.com/stateset/stateset-desktop.git
cd stateset-desktop
```

2. Install dependencies:

```bash
npm install
```

3. Create environment file:

```bash
cp .env.example .env
```

4. Configure your API URL in `.env`:

```
VITE_API_URL=https://engine.stateset.cloud.stateset.app
```

### Running in Development

```bash
npm start
```

You can also run the app with a direct command:

```bash
./start
```

For a globally available command, install the tiny CLI helper:

```bash
./scripts/install-cli.sh
```

Then run from anywhere:

```bash
stateset-desktop
```

This will:

1. Start Vite dev server on port 5173
2. Launch Electron pointing to the dev server
3. Enable hot module replacement

### Building for Production

```bash
npm run build
```

This creates distributable packages in the `release/` directory.

## Project Structure

```
stateset-desktop/
├── electron/           # Electron main process
│   ├── main.ts         # Main entry point
│   ├── preload.ts      # IPC bridge
│   └── oauth/          # OAuth handlers
├── src/                # React renderer
│   ├── components/     # UI components
│   ├── pages/          # Page components
│   ├── hooks/          # React hooks
│   ├── lib/            # API client
│   ├── stores/         # Zustand stores
│   └── types/          # TypeScript types
├── public/             # Static assets
└── assets/             # App icons
```

## API Integration

The app communicates with the StateSet API for:

- **Authentication**: API key validation
- **Agent Sessions**: CRUD operations, start/stop/pause
- **SSE Streaming**: Real-time event stream
- **Secrets**: Platform credential storage

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
