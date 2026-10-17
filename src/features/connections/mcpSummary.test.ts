import { describe, it, expect } from 'vitest';
import { summarizeMcpServers } from './mcpSummary';
import type { McpServerOption } from './hooks/useMcpServerOptions';

const now = Date.parse('2026-09-20T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

function option(overrides: Partial<McpServerOption> = {}): McpServerOption {
  return {
    id: 'srv',
    name: 'Server',
    connected: true,
    isLocalOnly: false,
    isMcpServer: true,
    ...overrides,
  };
}

describe('summarizeMcpServers', () => {
  it('counts nothing for an empty list', () => {
    expect(summarizeMcpServers([], now)).toEqual({
      connected: 0,
      verified: 0,
      stale: 0,
      unverified: 0,
      tools: 0,
    });
  });

  it('ignores servers that are not connected', () => {
    const summary = summarizeMcpServers(
      [option({ id: 'a' }), option({ id: 'b', connected: false, verifiedAt: daysAgo(1) })],
      now
    );

    expect(summary.connected).toBe(1);
    expect(summary.verified).toBe(0);
  });

  it('splits connected servers into verified, stale and unverified', () => {
    const summary = summarizeMcpServers(
      [
        option({ id: 'fresh', verifiedAt: daysAgo(1), toolCount: 3 }),
        option({ id: 'old', verifiedAt: daysAgo(30), toolCount: 9 }),
        option({ id: 'never' }),
      ],
      now
    );

    expect(summary).toEqual({
      connected: 3,
      verified: 1,
      stale: 1,
      unverified: 1,
      tools: 3,
    });
  });

  it('totals tools across verified servers only', () => {
    const summary = summarizeMcpServers(
      [
        option({ id: 'a', verifiedAt: daysAgo(1), toolCount: 3 }),
        option({ id: 'b', verifiedAt: daysAgo(2), toolCount: 12 }),
        option({ id: 'c', verifiedAt: daysAgo(90), toolCount: 100 }),
      ],
      now
    );

    expect(summary.tools).toBe(15);
  });

  it('ignores platform integrations that are not MCP servers', () => {
    const summary = summarizeMcpServers(
      [
        option({
          id: 'shopify',
          isLocalOnly: false,
          isMcpServer: false,
          verifiedAt: daysAgo(1),
          toolCount: 5,
        }),
        option({ id: 'stateset-sync', verifiedAt: daysAgo(1), toolCount: 3 }),
      ],
      now
    );

    expect(summary).toEqual({ connected: 1, verified: 1, stale: 0, unverified: 0, tools: 3 });
  });

  it('treats a verified server with no reported count as contributing no tools', () => {
    const summary = summarizeMcpServers([option({ id: 'a', verifiedAt: daysAgo(1) })], now);

    expect(summary).toEqual({ connected: 1, verified: 1, stale: 0, unverified: 0, tools: 0 });
  });
});
