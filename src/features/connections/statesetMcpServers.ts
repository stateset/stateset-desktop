import type { Platform } from './platforms';

/** A hosted StateSet MCP server that cloud agents can reach over HTTP. */
export interface StatesetHttpMcpServer extends Platform {
  transport: 'http';
  /** MCP endpoint; `{tenant}` is replaced with the `sync_tenant` field value. */
  endpoint: string;
}

/** A StateSet MCP server that only runs locally as a stdio process. */
export interface StatesetStdioMcpServer extends Omit<Platform, 'requiredFields' | 'oauth'> {
  transport: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Extra setup needed before the command works (e.g. building from source). */
  setupNote?: string;
}

export type StatesetMcpServer = StatesetHttpMcpServer | StatesetStdioMcpServer;

const API_KEY_FIELD = { key: 'auth_token', label: 'API Key', type: 'password' };

export const STATESET_MCP_SERVERS: StatesetMcpServer[] = [
  {
    id: 'stateset-response',
    name: 'StateSet ResponseCX',
    description: 'Manage agents, rules, knowledge, functions, and evals',
    icon: '🤖',
    color: 'bg-brand-600',
    transport: 'http',
    endpoint: 'https://response.stateset.com/api/mcp',
    requiredFields: [API_KEY_FIELD],
  },
  {
    id: 'stateset-engine',
    name: 'StateSet Engine',
    description: 'Workstream engine tools for agents, sessions, and workflows',
    icon: '⚙️',
    color: 'bg-slate-600',
    transport: 'http',
    endpoint: 'https://api.workstream.stateset.com/v1/mcp',
    requiredFields: [API_KEY_FIELD],
  },
  {
    id: 'stateset-sync',
    name: 'StateSet Sync',
    description: 'Order, inventory, product, and returns sync across channels',
    icon: '🔁',
    color: 'bg-cyan-700',
    transport: 'http',
    endpoint: 'https://api.sync.stateset.com/v1/tenants/{tenant}/mcp',
    requiredFields: [
      { key: 'sync_tenant', label: 'Sync Tenant ID', type: 'text' },
      { ...API_KEY_FIELD, label: 'Sync API Key (ss_sync_…)' },
    ],
  },
  {
    id: 'stateset-nsr',
    name: 'StateSet NSR',
    description: 'Neuro-symbolic reasoning with verifiable decisions and proofs',
    icon: '🧠',
    color: 'bg-violet-700',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'stateset-nsr-mcp'],
    env: {
      NSR_API_URL: 'https://api.nsr.stateset.com',
      NSR_API_KEY: '<your NSR API key>',
    },
  },
  {
    id: 'stateset-commerce',
    name: 'StateSet Commerce',
    description: 'Embedded commerce engine: carts, orders, inventory, checkout',
    icon: '🛒',
    color: 'bg-emerald-700',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@stateset/cli@latest', 'stateset-mcp-events'],
    env: { DB_PATH: './store.db' },
  },
  {
    id: 'stateset-voice',
    name: 'StateSet Voice',
    description: 'Voice agents, phone numbers, calls, transcripts, and latency',
    icon: '📞',
    color: 'bg-rose-700',
    transport: 'stdio',
    command: 'node',
    args: ['/absolute/path/to/rust-phone-server/mcp-server/dist/index.js'],
    env: {
      STATESET_VOICE_BASE_URL: 'https://api.voice.stateset.com',
      STATESET_VOICE_API_KEY: '<your tenant API key>',
    },
    setupNote:
      'Not published to npm. Build it from the rust-phone-server repo: cd mcp-server && npm install && npm run build.',
  },
  {
    id: 'stateset-edi',
    name: 'StateSet EDI',
    description: 'X12/EDIFACT documents, trading partners, ASNs, and invoices',
    icon: '📄',
    color: 'bg-orange-700',
    transport: 'stdio',
    command: 'node',
    args: ['/absolute/path/to/stateset-edi/mcp/dist/index.js'],
    env: {
      EDI_API_BASE: 'https://api.edi.stateset.com',
      EDI_API_TOKEN: '<your tenant key>',
    },
    setupNote:
      'Not published to npm. Build it from the stateset-edi repo: cd mcp && npm install && npm run build.',
  },
];

export const STATESET_HTTP_MCP_SERVERS = STATESET_MCP_SERVERS.filter(
  (server): server is StatesetHttpMcpServer => server.transport === 'http'
);

export const STATESET_STDIO_MCP_SERVERS = STATESET_MCP_SERVERS.filter(
  (server): server is StatesetStdioMcpServer => server.transport === 'stdio'
);

export function getStatesetHttpMcpServer(id: string): StatesetHttpMcpServer | undefined {
  return STATESET_HTTP_MCP_SERVERS.find((server) => server.id === id);
}

export function isStatesetHttpMcpServer(id: string): boolean {
  return getStatesetHttpMcpServer(id) !== undefined;
}

/**
 * Builds the credentials stored for a StateSet MCP server: `{ endpoint, auth_token }`
 * like a custom MCP server, plus every other required field. Those extra fields
 * (Sync's tenant id) are folded into the endpoint but must stay in the saved
 * record, because saving re-validates the credentials against the same
 * `requiredFields`.
 */
export function buildStatesetMcpCredentials(
  server: StatesetHttpMcpServer,
  values: Record<string, string>
): Record<string, string> {
  const trimmed = Object.fromEntries(
    server.requiredFields.map((field) => [field.key, (values[field.key] || '').trim()])
  );
  const missingField = server.requiredFields.find((field) => !trimmed[field.key]);
  if (missingField) {
    throw new Error(`Please provide ${missingField.label.toLowerCase()}.`);
  }

  const endpoint = trimmed.sync_tenant
    ? server.endpoint.replace('{tenant}', encodeURIComponent(trimmed.sync_tenant))
    : server.endpoint;

  return { ...trimmed, endpoint };
}

/** Renders an `mcpServers` config block for Claude Desktop, Cursor, and other MCP clients. */
export function formatStdioClientConfig(server: StatesetStdioMcpServer): string {
  return JSON.stringify(
    {
      mcpServers: { [server.id]: { command: server.command, args: server.args, env: server.env } },
    },
    null,
    2
  );
}
