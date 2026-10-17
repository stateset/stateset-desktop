/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useOptimisticSessionMutation } from './useOptimisticSessionMutation';
import { useAuthStore } from '../stores/auth';
import { queryKeys } from '../lib/queryKeys';
import { makeSession } from '../features/dashboard/testing/fixtures';
import type { Tenant, Brand } from '../types';

afterEach(cleanup);

it('keeps a late rollback in its originating workspace', async () => {
  const tenant = { id: 'tenant-a' } as Tenant;
  const brandA = { id: 'brand-a', tenant_id: tenant.id } as Brand;
  const brandB = { ...brandA, id: 'brand-b' };
  useAuthStore.setState({ tenant, currentBrand: brandA, apiKey: 'test-key' });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keyA = queryKeys.sessions.list(tenant.id, brandA.id);
  const keyB = queryKeys.sessions.list(tenant.id, brandB.id);
  const own = [
    makeSession({ id: 'session-a', status: 'stopped', tenant_id: tenant.id, brand_id: brandA.id }),
  ];
  const other = [
    makeSession({ id: 'session-b', status: 'running', tenant_id: tenant.id, brand_id: brandB.id }),
  ];
  client.setQueryData(keyA, own);
  client.setQueryData(keyB, other);
  let fail!: (error: Error) => void;
  const mutationFn = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      })
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      brand: useAuthStore((state) => state.currentBrand?.id),
      action: useOptimisticSessionMutation({ optimisticStatus: 'starting', mutationFn }),
    }),
    { wrapper }
  );
  let pending!: Promise<unknown>;
  act(() => {
    pending = hook.result.current.action.mutateAsync('session-a').catch((error) => error);
  });
  await waitFor(() => expect(mutationFn).toHaveBeenCalledWith(tenant.id, brandA.id, 'session-a'));
  act(() => {
    useAuthStore.setState({ currentBrand: brandB });
  });
  await waitFor(() => expect(hook.result.current.brand).toBe(brandB.id));
  await act(async () => {
    fail(new Error('Original request failed'));
    await pending;
  });
  expect(client.getQueryData(keyB)).toEqual(other);
  expect(client.getQueryData(keyA)).toEqual(own);
  client.clear();
});

function setup() {
  const tenant = { id: 'tenant-a' } as Tenant;
  const brandA = { id: 'brand-a', tenant_id: tenant.id } as Brand;
  const brandB = { ...brandA, id: 'brand-b' };
  useAuthStore.setState({ tenant, currentBrand: brandA, apiKey: 'test-secret-before' });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keyA = queryKeys.sessions.list(tenant.id, brandA.id);
  const keyB = queryKeys.sessions.list(tenant.id, brandB.id);
  const own = [
    makeSession({ id: 'session-a', status: 'stopped', tenant_id: tenant.id, brand_id: brandA.id }),
  ];
  const other = [
    makeSession({ id: 'session-b', status: 'running', tenant_id: tenant.id, brand_id: brandB.id }),
  ];
  client.setQueryData(keyA, own);
  client.setQueryData(keyB, other);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const request = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  const operation = vi.fn(() => request);
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useOptimisticSessionMutation({
        optimisticStatus: 'starting',
        mutationFn: operation,
        onError,
        onSuccess,
      }),
    { wrapper }
  );
  let pending: Promise<unknown> = Promise.resolve();
  const invoke = () => {
    act(() => {
      pending = hook.result.current.mutateAsync('session-a').catch((error) => error);
    });
  };
  const fail = async () => {
    await act(async () => {
      reject(new Error('Original request failed'));
      await pending;
    });
  };
  const succeed = async () => {
    await act(async () => {
      resolve();
      await pending;
    });
  };
  const settled = async () => {
    await act(async () => {
      await pending;
    });
  };
  return {
    ...hook,
    tenant,
    brandA,
    brandB,
    own,
    other,
    client,
    keyA,
    keyB,
    invalidate,
    operation,
    onError,
    onSuccess,
    invoke,
    fail,
    succeed,
    settled,
  };
}

it.each(['brand', 'tenant'] as const)(
  'does not report a late failure in the newly selected %s',
  async (kind) => {
    const h = setup();
    h.invoke();
    await waitFor(() => expect(h.operation).toHaveBeenCalledTimes(1));
    const tenant = kind === 'tenant' ? { ...h.tenant, id: 'tenant-b' } : h.tenant;
    const brand = kind === 'brand' ? h.brandB : { ...h.brandA, tenant_id: tenant.id };
    const nextKey = queryKeys.sessions.list(tenant.id, brand.id);
    h.client.setQueryData(nextKey, h.other);
    act(() => useAuthStore.setState({ tenant, currentBrand: brand }));
    await h.fail();
    expect(h.client.getQueryData(nextKey)).toEqual(h.other);
    expect(h.client.getQueryData(h.keyA)).toEqual(h.own);
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: h.keyA,
      exact: true,
      refetchType: 'none',
    });
    h.client.clear();
  }
);

it('does not restore a snapshot belonging to a replaced credential or record secrets in cache metadata', async () => {
  const h = setup();
  h.invoke();
  await waitFor(() => expect(h.operation).toHaveBeenCalledTimes(1));
  const optimistic = h.client.getQueryData(h.keyA);
  act(() => useAuthStore.setState({ apiKey: 'test-secret-after' }));
  await h.fail();
  expect(h.client.getQueryData(h.keyA)).toBe(optimistic);
  expect(h.client.getQueryState(h.keyA)?.isInvalidated).toBe(true);
  expect(h.onError).not.toHaveBeenCalled();
  const metadata = JSON.stringify(
    h.client
      .getMutationCache()
      .getAll()
      .map((mutation) => ({ key: mutation.options.mutationKey, context: mutation.state.context }))
  );
  expect(metadata).not.toContain('test-secret-before');
  expect(metadata).not.toContain('test-secret-after');
  h.client.clear();
});

it.each(['brand', 'credential'] as const)(
  'refuses to send after the %s changes during optimistic setup',
  async (kind) => {
    const h = setup();
    let release!: () => void;
    const cancel = vi.spyOn(h.client, 'cancelQueries').mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    h.invoke();
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    act(() =>
      useAuthStore.setState(
        kind === 'brand' ? { currentBrand: h.brandB } : { apiKey: 'test-secret-after' }
      )
    );
    await act(async () => {
      release();
    });
    await h.settled();
    expect(h.operation).not.toHaveBeenCalled();
    expect(h.client.getQueryData(h.keyA)).toEqual(h.own);
    expect(h.client.getQueryData(h.keyB)).toEqual(h.other);
    expect(h.onError).not.toHaveBeenCalled();
    h.client.clear();
  }
);

it('preserves a newer server response when the original request fails', async () => {
  const h = setup();
  h.invoke();
  await waitFor(() => expect(h.operation).toHaveBeenCalledTimes(1));
  const newer = [{ ...h.own[0], status: 'failed' as const }];
  h.client.setQueryData(h.keyA, newer);
  await h.fail();
  expect(h.client.getQueryData(h.keyA)).toEqual(newer);
  expect(h.onError).toHaveBeenCalledTimes(1);
  expect(h.invalidate).toHaveBeenCalledExactlyOnceWith({
    queryKey: h.keyA,
    exact: true,
    refetchType: 'active',
  });
  h.client.clear();
});

it('refreshes only the originating list and suppresses a success notification after a workspace switch', async () => {
  const h = setup();
  h.invoke();
  await waitFor(() => expect(h.operation).toHaveBeenCalledTimes(1));
  act(() => useAuthStore.setState({ currentBrand: h.brandB }));
  await h.succeed();
  expect(h.operation).toHaveBeenCalledExactlyOnceWith(h.tenant.id, h.brandA.id, 'session-a');
  expect(h.onSuccess).not.toHaveBeenCalled();
  expect(h.client.getQueryData(h.keyB)).toEqual(h.other);
  expect(h.invalidate).toHaveBeenCalledExactlyOnceWith({
    queryKey: h.keyA,
    exact: true,
    refetchType: 'none',
  });
  h.client.clear();
});

it('does not recreate cleared query data after logout', async () => {
  const h = setup();
  h.invoke();
  await waitFor(() => expect(h.operation).toHaveBeenCalledTimes(1));
  act(() => {
    useAuthStore.setState({ tenant: null, currentBrand: null, apiKey: null });
    h.client.clear();
  });
  await h.fail();
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  expect(h.onError).not.toHaveBeenCalled();
});
