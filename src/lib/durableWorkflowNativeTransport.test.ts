/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import * as workflowStore from '../stores/durableWorkflows';
import { durableWorkflowApi, engineRequest, type DurableWorkflowEvent } from './durableWorkflows';

const store = workflowStore.useDurableWorkflowsStore;
const request = vi.fn();
const stream = vi.fn();
const cancel = vi.fn();
const rendererFetch = vi.fn();
let generation = 0;
let nextId = 0;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const event: DurableWorkflowEvent = {
  event_id: 42,
  kind: 'activity_completed',
  ts: '2026-10-17T12:00:00Z',
  activity: 'run_sandbox',
};

function observeSubscriptions() {
  const connectionSubscribe = store.subscribe;
  const tenantSubscribe = useAuthStore.subscribe;
  const unsubscribeConnection = vi.fn();
  const unsubscribeTenant = vi.fn();
  vi.spyOn(store, 'subscribe').mockImplementation((listener) => {
    const unsubscribe = connectionSubscribe(listener);
    return () => {
      unsubscribeConnection();
      unsubscribe();
    };
  });
  vi.spyOn(useAuthStore, 'subscribe').mockImplementation((listener) => {
    const unsubscribe = tenantSubscribe(listener);
    return () => {
      unsubscribeTenant();
      unsubscribe();
    };
  });
  return { unsubscribeConnection, unsubscribeTenant };
}

beforeEach(() => {
  vi.restoreAllMocks();
  request.mockReset().mockResolvedValue({ ok: true, status: 200, body: { status: 'healthy' } });
  stream.mockReset().mockResolvedValue(undefined);
  cancel.mockReset().mockResolvedValue(true);
  rendererFetch.mockReset();
  generation = 0;
  nextId = 0;
  vi.spyOn(workflowStore, 'getWorkflowConnectionGeneration').mockImplementation(() => generation);
  vi.stubGlobal('crypto', {
    randomUUID: () => `11111111-1111-4111-8111-${String(++nextId).padStart(12, '0')}`,
  });
  vi.stubGlobal('fetch', rendererFetch);
  window.electronAPI = { durableWorkflows: { request, stream, cancel } } as never;
  useAuthStore.setState({ tenant: { id: 'tenant-1' } } as never);
  store.setState({
    initialized: true,
    configuring: false,
    engineUrl: 'https://engine.example/',
    apiKey: 'private-engine-key',
    connectionRevision: 'saved-revision',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native durable workflow requests', () => {
  it('prefers native HTTP transport with scoped UUIDs and no credential or header fields', async () => {
    request.mockResolvedValueOnce({ ok: true, status: 202, body: { accepted: true } });
    await expect(
      engineRequest('/v1/workflows/active-horizon-agent/workflow-1/steer', {
        tenantId: 'tenant-1',
        method: 'POST',
        body: { note: 'Inspect inventory' },
      })
    ).resolves.toEqual({ accepted: true });
    await durableWorkflowApi.health('tenant-1');
    expect(request.mock.calls[0][0]).toEqual({
      id: '11111111-1111-4111-8111-000000000001',
      engineUrl: 'https://engine.example',
      revision: 'saved-revision',
      tenantId: 'tenant-1',
      path: '/v1/workflows/active-horizon-agent/workflow-1/steer',
      method: 'POST',
      body: { note: 'Inspect inventory' },
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      id: '11111111-1111-4111-8111-000000000002',
      path: '/health',
      method: 'GET',
    });
    expect(JSON.stringify(request.mock.calls)).not.toContain('private-engine-key');
    expect(request.mock.calls[0][0]).not.toHaveProperty('headers');
    expect(rendererFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['/v1/workflows/connector/start', 'POST'],
    ['/v1/workflows/connector/connector-workflow-1/status', 'GET'],
    ['/v1/workflows/connector/connector-workflow-1/cancel', 'POST'],
  ] as const)(
    'dispatches the supported legacy connector route %s over native transport',
    async (path, method) => {
      await engineRequest(path, { tenantId: 'tenant-1', method });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ path, method, tenantId: 'tenant-1' })
      );
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ message: 'Scope mismatch', error: 'secondary' }, 'Scope mismatch'],
    [{ error: 'Workflow missing' }, 'Workflow missing'],
    ['Plain engine error', 'Plain engine error'],
    [null, 'Durable workflow engine returned 409'],
  ])('preserves native HTTP failure status and message precedence (%j)', async (body, message) => {
    request.mockResolvedValueOnce({ ok: false, status: 409, body });
    await expect(durableWorkflowApi.health('tenant-1')).rejects.toMatchObject({
      message,
      status: 409,
    });
    expect(rendererFetch).not.toHaveBeenCalled();
  });

  it.each(['rejection', 'synchronous throw'] as const)(
    'never falls back to fetch on native %s',
    async (failure) => {
      const error = new Error('Native transport unavailable.');
      request.mockImplementationOnce(() => {
        if (failure === 'synchronous throw') throw error;
        return Promise.reject(error);
      });
      await expect(durableWorkflowApi.health('tenant-1')).rejects.toBe(error);
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it.each(['uninitialized', 'configuring', 'revision', 'tenant'] as const)(
    'rejects an untrusted native context before dispatch (%s)',
    async (invalid) => {
      if (invalid === 'uninitialized') store.setState({ initialized: false });
      if (invalid === 'configuring') store.setState({ configuring: true });
      if (invalid === 'revision') store.setState({ connectionRevision: null });
      if (invalid === 'tenant') useAuthStore.setState({ tenant: { id: 'tenant-2' } } as never);
      await expect(durableWorkflowApi.health('tenant-1')).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    'URL',
    'key',
    'revision',
    'generation',
    'tenant',
    'initialization',
    'configuring',
  ] as const)(
    'cancels stale HTTP work promptly when its %s changes and ignores later completion',
    async (field) => {
      const pending = deferred<{ ok: boolean; status: number; body: unknown }>();
      request.mockReturnValueOnce(pending.promise);
      const subscriptions = observeSubscriptions();
      const running = durableWorkflowApi.health('tenant-1');
      const rejected = expect(running).rejects.toThrow('connection or organization changed');
      if (field === 'URL') store.setState({ engineUrl: 'https://replacement.example' });
      if (field === 'key') store.setState({ apiKey: 'replacement-key' });
      if (field === 'revision') store.setState({ connectionRevision: 'replacement-revision' });
      if (field === 'generation') {
        generation++;
        store.setState({ configuring: false });
      }
      if (field === 'tenant') useAuthStore.setState({ tenant: { id: 'tenant-2' } } as never);
      if (field === 'initialization') store.setState({ initialized: false });
      if (field === 'configuring') store.setState({ configuring: true });
      await rejected;
      expect(cancel).toHaveBeenCalledWith(request.mock.calls[0][0].id);
      expect(subscriptions.unsubscribeConnection).toHaveBeenCalledOnce();
      expect(subscriptions.unsubscribeTenant).toHaveBeenCalledOnce();
      pending.resolve({ ok: true, status: 200, body: { status: 'healthy' } });
      await Promise.resolve();
      expect(cancel).toHaveBeenCalledOnce();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it('rejects A-to-B-to-A tenant changes even when the final scope matches the request', async () => {
    const pending = deferred<{ ok: boolean; status: number; body: unknown }>();
    request.mockReturnValueOnce(pending.promise);
    const running = durableWorkflowApi.health('tenant-1');
    const rejected = expect(running).rejects.toThrow('organization changed');
    useAuthStore.setState({ tenant: { id: 'tenant-2' } } as never);
    useAuthStore.setState({ tenant: { id: 'tenant-1' } } as never);
    await rejected;
    pending.reject(new Error('Late old native rejection.'));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('aborts native HTTP promptly, cancels its UUID, and removes every subscription', async () => {
    const pending = deferred<{ ok: boolean; status: number; body: unknown }>();
    request.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
    const subscriptions = observeSubscriptions();
    const running = engineRequest('/health', { tenantId: 'tenant-1', signal: controller.signal });
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledWith(request.mock.calls[0][0].id);
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(subscriptions.unsubscribeConnection).toHaveBeenCalledOnce();
    expect(subscriptions.unsubscribeTenant).toHaveBeenCalledOnce();
    pending.reject(new Error('Late rejection after abort.'));
    await Promise.resolve();
  });

  it('cleans up successful requests without later cancellation', async () => {
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
    const subscriptions = observeSubscriptions();
    await engineRequest('/health', { tenantId: 'tenant-1', signal: controller.signal });
    expect(subscriptions.unsubscribeConnection).toHaveBeenCalledOnce();
    expect(subscriptions.unsubscribeTenant).toHaveBeenCalledOnce();
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    store.setState({ apiKey: null });
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each(['rejection', 'synchronous throw'] as const)(
    'preserves the abort error if native cancellation fails with a %s',
    async (failure) => {
      const pending = deferred<{ ok: boolean; status: number; body: unknown }>();
      request.mockReturnValueOnce(pending.promise);
      cancel.mockImplementationOnce(() => {
        const error = new Error('Native cancellation failed.');
        if (failure === 'synchronous throw') throw error;
        return Promise.reject(error);
      });
      const controller = new AbortController();
      const running = engineRequest('/health', { tenantId: 'tenant-1', signal: controller.signal });
      const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejected;
      pending.resolve({ ok: true, status: 200, body: {} });
      await Promise.resolve();
      expect(cancel).toHaveBeenCalledOnce();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );
});

describe('native durable workflow event streams', () => {
  it.each([0, 41])(
    'preserves resume cursor %s, scoped events and stream completion',
    async (lastEventId) => {
      const pending = deferred<void>();
      stream.mockReturnValueOnce(pending.promise);
      const onEvent = vi.fn();
      const controller = new AbortController();
      const subscriptions = observeSubscriptions();
      const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
      const running = durableWorkflowApi.streamEvents('tenant-1', 'workflow:with spaces', {
        lastEventId,
        onEvent,
        signal: controller.signal,
      });
      const [submitted, deliver] = stream.mock.calls[0];
      expect(submitted).toEqual({
        id: '11111111-1111-4111-8111-000000000001',
        engineUrl: 'https://engine.example',
        revision: 'saved-revision',
        tenantId: 'tenant-1',
        workflowId: 'workflow:with spaces',
        lastEventId,
      });
      expect(JSON.stringify(submitted)).not.toContain('private-engine-key');
      deliver(event);
      expect(onEvent.mock.calls).toEqual([[event]]);
      pending.resolve();
      await running;
      expect(subscriptions.unsubscribeConnection).toHaveBeenCalledOnce();
      expect(subscriptions.unsubscribeTenant).toHaveBeenCalledOnce();
      expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
      controller.abort();
      deliver({ ...event, event_id: 43 });
      expect(onEvent).toHaveBeenCalledOnce();
      expect(cancel).not.toHaveBeenCalled();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it.each(['tenant', 'revision'] as const)(
    'suppresses stale stream events after its %s changes',
    async (field) => {
      const pending = deferred<void>();
      stream.mockReturnValueOnce(pending.promise);
      const onEvent = vi.fn();
      const running = durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', { onEvent });
      const rejected = expect(running).rejects.toThrow('connection or organization changed');
      const [submitted, deliver] = stream.mock.calls[0];
      if (field === 'tenant') useAuthStore.setState({ tenant: { id: 'tenant-2' } } as never);
      else store.setState({ connectionRevision: 'new-revision' });
      deliver(event);
      await rejected;
      expect(onEvent).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledWith(submitted.id);
      pending.resolve();
      await Promise.resolve();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it('aborts a stream, cancels native work and ignores late events and rejection', async () => {
    const pending = deferred<void>();
    stream.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const onEvent = vi.fn();
    const running = durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', {
      signal: controller.signal,
      onEvent,
    });
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    const [submitted, deliver] = stream.mock.calls[0];
    controller.abort();
    await rejected;
    deliver(event);
    expect(onEvent).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(submitted.id);
    pending.reject(new Error('Late stream rejection after cancellation.'));
    await Promise.resolve();
  });

  it('propagates callback errors immediately for preload cancellation and removes context listeners', async () => {
    const pending = deferred<void>();
    stream.mockReturnValueOnce(pending.promise);
    const error = new Error('Timeline event consumer failed.');
    const subscriptions = observeSubscriptions();
    const running = durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', {
      onEvent: () => {
        throw error;
      },
    });
    const rejected = expect(running).rejects.toBe(error);
    const deliver = stream.mock.calls[0][1];
    expect(() => deliver(event)).toThrow(error);
    await rejected;
    expect(subscriptions.unsubscribeConnection).toHaveBeenCalledOnce();
    expect(subscriptions.unsubscribeTenant).toHaveBeenCalledOnce();
    pending.reject(error);
    await Promise.resolve();
    expect(rendererFetch).not.toHaveBeenCalled();
  });

  it('does not retry a native stream failure through renderer fetch', async () => {
    stream.mockRejectedValueOnce(new Error('Native event transport failed.'));
    await expect(
      durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', { onEvent: vi.fn() })
    ).rejects.toThrow('Native event transport failed');
    expect(rendererFetch).not.toHaveBeenCalled();
  });
});

describe('legacy and browser fallback', () => {
  it.each([
    ['HTTP', true],
    ['stream', true],
    ['HTTP', false],
    ['stream', false],
  ] as const)(
    'never starts %s transport for an already aborted signal (native=%s)',
    async (operation, native) => {
      if (!native) window.electronAPI = undefined;
      const controller = new AbortController();
      controller.abort();
      await expect(
        operation === 'HTTP'
          ? engineRequest('/health', { tenantId: 'tenant-1', signal: controller.signal })
          : durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', {
              signal: controller.signal,
              onEvent: vi.fn(),
            })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(request).not.toHaveBeenCalled();
      expect(stream).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(rendererFetch).not.toHaveBeenCalled();
    }
  );

  it('retains authenticated renderer HTTP when the native namespace is absent', async () => {
    window.electronAPI = undefined;
    store.setState({ connectionRevision: null });
    rendererFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(engineRequest('/health', { tenantId: 'tenant-1' })).resolves.toEqual({ ok: true });
    expect(rendererFetch).toHaveBeenCalledWith(
      'https://engine.example/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer private-engine-key' }),
      })
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'closes and unlocks a fallback stream after completion or callback failure (failed=%s)',
    async (failed) => {
      window.electronAPI = undefined;
      const nativeCancel = vi.fn();
      const bytes = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          if (!failed) controller.close();
        },
        cancel: nativeCancel,
      });
      rendererFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));
      const error = new Error('Fallback consumer failed.');
      const onEvent = vi.fn(() => {
        if (failed) throw error;
      });
      const running = durableWorkflowApi.streamEvents('tenant-1', 'workflow-1', {
        lastEventId: 0,
        onEvent,
      });
      if (failed) await expect(running).rejects.toBe(error);
      else await running;
      expect(body.locked).toBe(false);
      if (failed) expect(nativeCancel).toHaveBeenCalledOnce();
      expect(rendererFetch.mock.calls[0][1].headers).not.toHaveProperty('Last-Event-ID');
      expect(stream).not.toHaveBeenCalled();
    }
  );
});
