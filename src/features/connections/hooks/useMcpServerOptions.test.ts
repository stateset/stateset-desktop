/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMcpServerOptions } from './useMcpServerOptions';
import { STATESET_HTTP_MCP_SERVERS } from '../statesetMcpServers';
import { useMcpServerOptionsState } from './useMcpServerOptions';

let mockHasData = true;

vi.mock('../../../stores/auth', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { currentBrand: { id: 'brand-1' } };
    return selector ? selector(state) : state;
  },
}));

vi.mock('./useMcpVerifications', () => ({
  useMcpVerifications: () => ({
    verifications: {
      'stateset-sync': {
        serverName: 'stateset-sync',
        serverVersion: '2.1.0',
        toolCount: 12,
        tools: ['list_orders', 'get_order'],
        verifiedAt: '2026-09-20T12:00:00.000Z',
      },
    },
    record: vi.fn(),
  }),
}));

vi.mock('./useConnections', () => ({
  useConnections: () => ({
    displayedPlatforms: [
      { id: 'shopify', name: 'Shopify' },
      { id: 'my-mcp', name: 'my-mcp' },
    ],
    isConnected: (id: string) => id === 'shopify' || id === 'stateset-sync',
    isLocalConnection: (id: string) => id === 'my-mcp',
    hasConnectionData: mockHasData,
  }),
}));

describe('useMcpServerOptions', () => {
  it('lists hosted StateSet servers first, then the other platforms', () => {
    const { result } = renderHook(() => useMcpServerOptions());

    expect(result.current.map((o) => o.id)).toEqual([
      ...STATESET_HTTP_MCP_SERVERS.map((s) => s.id),
      'shopify',
      'my-mcp',
    ]);
  });

  it('marks which options are connected', () => {
    const { result } = renderHook(() => useMcpServerOptions());
    const connected = result.current.filter((o) => o.connected).map((o) => o.id);

    expect(connected).toEqual(['stateset-sync', 'shopify']);
    expect(result.current.find((o) => o.id === 'stateset-sync')?.name).toBe('StateSet Sync');
  });

  it('carries the verified tool count and names for servers that have been tested', () => {
    const { result } = renderHook(() => useMcpServerOptions());
    const sync = result.current.find((option) => option.id === 'stateset-sync');
    const shopify = result.current.find((option) => option.id === 'shopify');

    expect(sync).toMatchObject({
      toolCount: 12,
      tools: ['list_orders', 'get_order'],
      verifiedAt: '2026-09-20T12:00:00.000Z',
    });
    expect(shopify?.toolCount).toBeUndefined();
  });

  it('marks connections that live only on this device', () => {
    const { result } = renderHook(() => useMcpServerOptions());

    expect(result.current.find((o) => o.id === 'my-mcp')?.isLocalOnly).toBe(true);
    expect(result.current.find((o) => o.id === 'shopify')?.isLocalOnly).toBe(false);
  });

  it('treats loading, failure and never-asked alike as "not yet known"', () => {
    mockHasData = false;

    const { result } = renderHook(() => useMcpServerOptionsState());

    // Callers that warn about missing credentials must not warn on an outage,
    // nor before a tenant and brand are chosen.
    expect(result.current.isLoading).toBe(true);
    mockHasData = true;
  });
});
