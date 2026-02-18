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
npm run dev
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
