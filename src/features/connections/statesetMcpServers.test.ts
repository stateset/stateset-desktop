import { describe, it, expect } from 'vitest';
import {
  STATESET_MCP_SERVERS,
  STATESET_HTTP_MCP_SERVERS,
  STATESET_STDIO_MCP_SERVERS,
  getStatesetHttpMcpServer,
  isStatesetHttpMcpServer,
  buildStatesetMcpCredentials,
  formatStdioClientConfig,
} from './statesetMcpServers';
import { PLATFORMS } from './platforms';

describe('STATESET_MCP_SERVERS', () => {
  it('lists every StateSet MCP server', () => {
    expect(STATESET_MCP_SERVERS.map((s) => s.id)).toEqual([
      'stateset-response',
      'stateset-engine',
      'stateset-sync',
      'stateset-nsr',
      'stateset-commerce',
      'stateset-voice',
      'stateset-edi',
    ]);
  });

  it('uses ids that do not collide with built-in platforms', () => {
    const builtInIds = new Set(PLATFORMS.map((p) => p.id));
    for (const server of STATESET_MCP_SERVERS) {
      expect(builtInIds.has(server.id)).toBe(false);
    }
  });

  it('splits servers by transport', () => {
    expect(STATESET_HTTP_MCP_SERVERS.map((s) => s.id)).toEqual([
      'stateset-response',
      'stateset-engine',
      'stateset-sync',
    ]);
    expect(STATESET_STDIO_MCP_SERVERS.map((s) => s.id)).toEqual([
      'stateset-nsr',
      'stateset-commerce',
      'stateset-voice',
      'stateset-edi',
    ]);
  });

  it('gives every HTTP server an https endpoint and a masked auth token field', () => {
    for (const server of STATESET_HTTP_MCP_SERVERS) {
      expect(server.endpoint).toMatch(/^https:\/\//);
      expect(server.requiredFields).toContainEqual(
        expect.objectContaining({ key: 'auth_token', type: 'password' })
      );
    }
  });

  it('gives every stdio server a command and args', () => {
    for (const server of STATESET_STDIO_MCP_SERVERS) {
      expect(server.command.length).toBeGreaterThan(0);
      expect(server.args.length).toBeGreaterThan(0);
    }
  });
});

describe('getStatesetHttpMcpServer / isStatesetHttpMcpServer', () => {
  it('finds HTTP servers by id', () => {
    expect(getStatesetHttpMcpServer('stateset-sync')?.name).toBe('StateSet Sync');
    expect(isStatesetHttpMcpServer('stateset-response')).toBe(true);
  });

  it('does not treat stdio or unknown ids as HTTP servers', () => {
    expect(getStatesetHttpMcpServer('stateset-nsr')).toBeUndefined();
    expect(isStatesetHttpMcpServer('stateset-nsr')).toBe(false);
    expect(isStatesetHttpMcpServer('shopify')).toBe(false);
    expect(isStatesetHttpMcpServer('')).toBe(false);
  });
});

describe('buildStatesetMcpCredentials', () => {
  it('stores the fixed endpoint alongside the auth token', () => {
    const server = getStatesetHttpMcpServer('stateset-response')!;
    expect(buildStatesetMcpCredentials(server, { auth_token: '  sk_123  ' })).toEqual({
      endpoint: 'https://response.stateset.com/api/mcp',
      auth_token: 'sk_123',
    });
  });

  it('substitutes the sync tenant into the Sync endpoint', () => {
    const server = getStatesetHttpMcpServer('stateset-sync')!;
    expect(
      buildStatesetMcpCredentials(server, { sync_tenant: ' acme-co ', auth_token: 'ss_sync_x' })
    ).toEqual({
      endpoint: 'https://api.sync.stateset.com/v1/tenants/acme-co/mcp',
      auth_token: 'ss_sync_x',
      // Kept so the saved credentials still satisfy the server's required fields.
      sync_tenant: 'acme-co',
    });
  });

  it('url-encodes the sync tenant', () => {
    const server = getStatesetHttpMcpServer('stateset-sync')!;
    const creds = buildStatesetMcpCredentials(server, {
      sync_tenant: 'a/b',
      auth_token: 'ss_sync_x',
    });
    expect(creds.endpoint).toBe('https://api.sync.stateset.com/v1/tenants/a%2Fb/mcp');
  });

  it('throws when a required field is missing', () => {
    const response = getStatesetHttpMcpServer('stateset-response')!;
    expect(() => buildStatesetMcpCredentials(response, { auth_token: '  ' })).toThrow(
      'Please provide api key.'
    );

    const sync = getStatesetHttpMcpServer('stateset-sync')!;
    expect(() => buildStatesetMcpCredentials(sync, { auth_token: 'ss_sync_x' })).toThrow(
      'Please provide sync tenant id.'
    );
  });
});

describe('saved credentials satisfy the platform contract', () => {
  it('keeps every required field, so re-validation on save passes', () => {
    for (const server of STATESET_HTTP_MCP_SERVERS) {
      const values = Object.fromEntries(server.requiredFields.map((field) => [field.key, 'value']));
      const creds = buildStatesetMcpCredentials(server, values);

      for (const field of server.requiredFields) {
        expect(creds[field.key]).toBeTruthy();
      }
      expect(creds.endpoint).toBeTruthy();
    }
  });
});

describe('formatStdioClientConfig', () => {
  it('renders an mcpServers JSON block for MCP clients', () => {
    const nsr = STATESET_STDIO_MCP_SERVERS.find((s) => s.id === 'stateset-nsr')!;
    expect(JSON.parse(formatStdioClientConfig(nsr))).toEqual({
      mcpServers: {
        'stateset-nsr': {
          command: 'npx',
          args: ['-y', 'stateset-nsr-mcp'],
          env: {
            NSR_API_URL: 'https://api.nsr.stateset.com',
            NSR_API_KEY: '<your NSR API key>',
          },
        },
      },
    });
  });
});
