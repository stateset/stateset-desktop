/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOptimisticSessionMutation } from './useOptimisticSessionMutation';

// --- Mocks ---

const mockTenant = { id: 'tenant-1', name: 'Test Tenant' };
const mockBrand = { id: 'brand-1', name: 'Test Brand' };

const mockAuthState = { tenant: mockTenant, currentBrand: mockBrand };
vi.mock('../stores/auth', () => ({
  useAuthStore: (selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}));

vi.mock('../lib/queryKeys', () => ({
  queryKeys: {
    sessions: {
      list: (tenantId?: string, brandId?: string) => ['sessions', 'list', tenantId, brandId],
      all: ['sessions'],
    },
  },
}));

vi.mock('../lib/logger', () => ({
  uiLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useOptimisticSessionMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mutationFn with tenant, brand, and session IDs', async () => {
    const mutationFn = vi.fn().mockResolvedValue({});
    const { result } = renderHook(
      () =>
        useOptimisticSessionMutation({
          optimisticStatus: 'running',
          mutationFn,
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate('session-1');
    });

    await waitFor(() => {
      expect(mutationFn).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1');
    });
  });

  it('reports error state on mutation failure', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useOptimisticSessionMutation({
          optimisticStatus: 'running',
          mutationFn,
          onError,
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate('session-1');
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(onError).toHaveBeenCalled();
    });
  });

  it('calls onSuccess when mutation succeeds', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useOptimisticSessionMutation({
          optimisticStatus: 'stopped',
          mutationFn,
          onSuccess,
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.mutate('session-1');
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
