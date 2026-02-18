/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useWebhooksList,
  useCreateWebhook,
  useDeleteWebhook,
  useUpdateWebhook,
} from './useWebhooks';

// Mock auth store
vi.mock('../../../stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    tenant: { id: 'tenant-1' },
    currentBrand: { id: 'brand-1' },
  })),
}));

// Mock webhooks API
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../lib/api', () => ({
  webhooksApi: {
    list: (...args: unknown[]) => mockList(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

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

describe('useWebhooksList', () => {
  it('fetches webhooks when tenant and brand are present', async () => {
    const webhooks = [{ id: 'wh-1', name: 'Test' }];
    mockList.mockResolvedValue(webhooks);

    const { result } = renderHook(() => useWebhooksList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(webhooks);
    expect(mockList).toHaveBeenCalledWith('tenant-1', 'brand-1');
  });
});

describe('useCreateWebhook', () => {
  it('calls create API and invalidates queries on success', async () => {
    mockCreate.mockResolvedValue({ id: 'wh-new' });

    const { result } = renderHook(() => useCreateWebhook(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      name: 'New Hook',
      url: 'https://example.com/hook',
      events: ['agent.started'],
    });

    expect(mockCreate).toHaveBeenCalledWith('tenant-1', 'brand-1', {
      name: 'New Hook',
      url: 'https://example.com/hook',
      events: ['agent.started'],
    });
  });
});

describe('useUpdateWebhook', () => {
  it('calls update API with webhook id and data', async () => {
    mockUpdate.mockResolvedValue({ id: 'wh-1' });

    const { result } = renderHook(() => useUpdateWebhook(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      webhookId: 'wh-1',
      data: { status: 'paused' },
    });

    expect(mockUpdate).toHaveBeenCalledWith('tenant-1', 'brand-1', 'wh-1', {
      status: 'paused',
    });
  });
});

describe('useDeleteWebhook', () => {
  it('calls delete API with webhook id', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteWebhook(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync('wh-1');

    expect(mockDelete).toHaveBeenCalledWith('tenant-1', 'brand-1', 'wh-1');
  });
});
