/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useConnections } from './useConnections';

// --- Mocks ---

const mockListConnections = vi.fn();
const mockLocalListConnections = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../lib/api', () => ({
  secretsApi: { listConnections: (...args: unknown[]) => mockListConnections(...args) },
}));

vi.mock('../../../lib/localSecrets', () => ({
  localSecretsApi: { listConnections: (...args: unknown[]) => mockLocalListConnections(...args) },
}));

vi.mock('../../../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    tenant: { id: 'tenant-1' },
    currentBrand: { id: 'brand-1' },
  })),
}));

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../../lib/auth-guards', () => ({
  requireTenantId: (t: { id?: string } | null) => t?.id,
  requireBrandId: (b: { id?: string } | null) => b?.id,
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConnections', () => {
  it('returns isLoading=true initially', () => {
    // Never resolve so query stays in loading state
    mockListConnections.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('returns displayedPlatforms with built-in platforms', async () => {
    mockListConnections.mockResolvedValue([]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // displayedPlatforms should contain all built-in platforms
    const platformIds = result.current.displayedPlatforms.map((p) => p.id);
    expect(platformIds).toContain('shopify');
    expect(platformIds).toContain('gorgias');
    expect(platformIds).toContain('zendesk');
    expect(platformIds).toContain('recharge');
    expect(platformIds).toContain('klaviyo');
    expect(platformIds).toContain('shipstation');

    // Should have at least the built-in count
    expect(result.current.displayedPlatforms.length).toBeGreaterThanOrEqual(6);
  });

  it('includes custom connected platforms in displayedPlatforms', async () => {
    mockListConnections.mockResolvedValue([{ platform: 'my-custom-mcp', connected: true }]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const platformIds = result.current.displayedPlatforms.map((p) => p.id);
    expect(platformIds).toContain('my-custom-mcp');
    // Custom platforms should come after built-in ones
    const customIndex = platformIds.indexOf('my-custom-mcp');
    const shopifyIndex = platformIds.indexOf('shopify');
    expect(customIndex).toBeGreaterThan(shopifyIndex);
  });

  it('reports isConnected correctly', async () => {
    mockListConnections.mockResolvedValue([
      { platform: 'shopify', connected: true },
      { platform: 'gorgias', connected: false },
    ]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isConnected('shopify')).toBe(true);
    expect(result.current.isConnected('gorgias')).toBe(false);
    expect(result.current.isConnected('zendesk')).toBe(false);
  });

  it('falls back to local mode when vault is not configured', async () => {
    mockListConnections.mockRejectedValue(new Error('Vault is not configured'));
    mockLocalListConnections.mockResolvedValue([{ platform: 'shopify', connected: true }]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isLocalMode).toBe(true);
    expect(result.current.vaultError).toBeDefined();
    expect(result.current.isConnected('shopify')).toBe(true);
    expect(result.current.isLocalConnection('shopify')).toBe(true);
  });
});
