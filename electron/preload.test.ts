import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
const mockExposeInMainWorld = vi.fn();

let exposedApi: Record<string, unknown> | undefined;
type IpcListener = (event: unknown, ...args: unknown[]) => void;
const listeners = new Map<string, Set<IpcListener>>();

interface PreloadApi {
  durableWorkflows: {
    request: (
      request: import('./durable-workflow-bridge').DurableWorkflowRequest
    ) => Promise<import('./durable-workflow-bridge').DurableWorkflowResponse>;
    stream: (
      request: import('./durable-workflow-bridge').DurableWorkflowStreamRequest,
      onEvent: (event: import('./durable-workflow-bridge').DurableWorkflowEvent) => void
    ) => Promise<void>;
    cancel: (id: string) => Promise<boolean>;
  };
  oauth: {
    shopify: {
      start: (shop: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
    gorgias: {
      start: (domain: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
    zendesk: {
      start: (subdomain: string) => Promise<unknown>;
      onSuccess: (callback: (result: unknown) => void) => () => void;
      onError: (callback: (error: unknown) => void) => () => void;
    };
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
  auth: {
    setApiKey: (apiKey: string) => Promise<boolean>;
    getApiKey: () => Promise<string | undefined>;
    clearApiKey: () => Promise<boolean>;
    setSandboxApiKey: (apiKey: string) => Promise<boolean>;
    getSandboxApiKey: () => Promise<string | undefined>;
    clearSandboxApiKey: () => Promise<boolean>;
    setDurableEngineApiKey: (apiKey: string) => Promise<boolean>;
    getDurableEngineApiKey: () => Promise<string | undefined>;
    clearDurableEngineApiKey: () => Promise<boolean>;
    isSecureStorageAvailable: () => Promise<boolean>;
  };
  mcp: {
    probe: (request: { endpoint: string; authToken?: string }) => Promise<unknown>;
  };
  secrets: {
    getLocal: () => Promise<string | undefined>;
    setLocal: (payload: string) => Promise<boolean>;
    clearLocal: () => Promise<boolean>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  app: {
    isE2ETest: boolean;
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    checkForUpdates: () => Promise<unknown>;
    installUpdate: () => Promise<boolean>;
    getUpdateStatus: () => Promise<unknown>;
    onUpdateChecking: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: unknown) => void) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onUpdateProgress: (callback: (progress: unknown) => void) => () => void;
    onUpdateDownloaded: (callback: (info: unknown) => void) => () => void;
    onUpdateError: (callback: (error: string) => void) => () => void;
  };
  background: {
    setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
    getMinimizeToTray: () => Promise<boolean>;
    updateAgentStatus: (status: { running: number; total: number }) => Promise<boolean>;
  };
  notifications: {
    show: (options: { title: string; body: string }) => Promise<boolean>;
  };
}

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      exposedApi = api as Record<string, unknown>;
      mockExposeInMainWorld(key, api);
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}));

async function loadPreload() {
  vi.resetModules();
  mockExposeInMainWorld.mockClear();
  mockInvoke.mockReset();
  listeners.clear();
  mockOn.mockReset().mockImplementation((channel: string, listener: IpcListener) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
  });
  mockRemoveListener.mockReset().mockImplementation((channel: string, listener: IpcListener) => {
    listeners.get(channel)?.delete(listener);
  });
  exposedApi = undefined;

  await import('./preload');
  return exposedApi as unknown as PreloadApi;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const firstStreamId = '11111111-1111-4111-8111-111111111111';
const secondStreamId = '22222222-2222-4222-8222-222222222222';
const workflowEvent = {
  event_id: 42,
  kind: 'activity_completed',
  ts: '2026-10-17T12:00:00Z',
  activity: 'run_sandbox',
};

function streamRequest(
  id = firstStreamId
): import('./durable-workflow-bridge').DurableWorkflowStreamRequest {
  return {
    id,
    engineUrl: 'https://engine.example.com',
    revision: 'connection-revision',
    tenantId: 'tenant-1',
    workflowId: 'workflow-1',
    lastEventId: 41,
  };
}

function emitWorkflowEvent(id: string, payload = workflowEvent) {
  const event = { sender: 'must not escape preload' };
  for (const listener of [...(listeners.get('durable-workflows:event') ?? [])]) {
    listener(event, id, payload);
  }
}

describe('preload', () => {
  beforeEach(() => {
    delete process.env.E2E_TEST;
    delete process.env.PLAYWRIGHT_TEST;
  });

  it('exposes the electron API in the renderer global', async () => {
    const api = await loadPreload();

    expect(mockExposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object));
    expect(api.store).toBeDefined();
    expect(api.oauth).toBeDefined();
    expect(api.auth).toBeDefined();
    expect(api.app).toBeDefined();
    expect(api.background).toBeDefined();
    expect(api.notifications).toBeDefined();
    expect(api.durableWorkflows).toBeDefined();
  });

  it('forwards invoke-based methods through ipcRenderer.invoke', async () => {
    const api = await loadPreload();

    await api.oauth.shopify.start('example.myshopify.com');
    await api.oauth.gorgias.start('example.gorgias.com');
    await api.oauth.zendesk.start('example');

    await api.store.get('foo');
    await api.store.set('foo', { a: 1 });
    await api.store.delete('foo');
    await api.store.clear();

    await api.auth.setApiKey('key-1');
    await api.auth.getApiKey();
    await api.auth.clearApiKey();
    await api.auth.setSandboxApiKey('sandbox-key');
    await api.auth.getSandboxApiKey();
    await api.auth.clearSandboxApiKey();
    await api.auth.setDurableEngineApiKey('durable-key');
    await api.auth.getDurableEngineApiKey();
    await api.auth.clearDurableEngineApiKey();
    await api.auth.isSecureStorageAvailable();

    await api.mcp.probe({ endpoint: 'https://mcp.example.com/mcp', authToken: 'tok' });

    await api.secrets.getLocal();
    await api.secrets.setLocal('encrypted-payload');
    await api.secrets.clearLocal();

    await api.window.minimize();
    await api.window.maximize();
    await api.window.close();

    await api.app.getVersion();
    await api.app.getPlatform();
    await api.app.checkForUpdates();
    await api.app.installUpdate();
    await api.app.getUpdateStatus();

    expect(mockInvoke).toHaveBeenCalledWith('oauth:shopify:start', 'example.myshopify.com');
    expect(mockInvoke).toHaveBeenCalledWith('oauth:gorgias:start', 'example.gorgias.com');
    expect(mockInvoke).toHaveBeenCalledWith('oauth:zendesk:start', 'example');
    expect(mockInvoke).toHaveBeenCalledWith('store:get', 'foo');
    expect(mockInvoke).toHaveBeenCalledWith('store:set', 'foo', { a: 1 });
    expect(mockInvoke).toHaveBeenCalledWith('store:delete', 'foo');
    expect(mockInvoke).toHaveBeenCalledWith('store:clear');
    expect(mockInvoke).toHaveBeenCalledWith('auth:setApiKey', 'key-1');
    expect(mockInvoke).toHaveBeenCalledWith('auth:getApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:clearApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:setSandboxApiKey', 'sandbox-key');
    expect(mockInvoke).toHaveBeenCalledWith('auth:getSandboxApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:clearSandboxApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:setDurableEngineApiKey', 'durable-key');
    expect(mockInvoke).toHaveBeenCalledWith('auth:getDurableEngineApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:clearDurableEngineApiKey');
    expect(mockInvoke).toHaveBeenCalledWith('auth:isSecureStorageAvailable');
    expect(mockInvoke).toHaveBeenCalledWith('mcp:probe', {
      endpoint: 'https://mcp.example.com/mcp',
      authToken: 'tok',
    });
    expect(mockInvoke).toHaveBeenCalledWith('secrets:getLocal');
    expect(mockInvoke).toHaveBeenCalledWith('secrets:setLocal', 'encrypted-payload');
    expect(mockInvoke).toHaveBeenCalledWith('secrets:clearLocal');
    expect(mockInvoke).toHaveBeenCalledWith('window:minimize');
    expect(mockInvoke).toHaveBeenCalledWith('window:maximize');
    expect(mockInvoke).toHaveBeenCalledWith('window:close');
    expect(mockInvoke).toHaveBeenCalledWith('app:getVersion');
    expect(mockInvoke).toHaveBeenCalledWith('app:getPlatform');
    expect(mockInvoke).toHaveBeenCalledWith('app:checkForUpdates');
    expect(mockInvoke).toHaveBeenCalledWith('app:installUpdate');
    expect(mockInvoke).toHaveBeenCalledWith('app:getUpdateStatus');
  });

  it('registers and unregisters OAuth event listeners', async () => {
    const api = await loadPreload();
    const shopifySuccessCallback = vi.fn();
    const shopifyErrorCallback = vi.fn();
    const gorgiasSuccessCallback = vi.fn();
    const zendeskErrorCallback = vi.fn();

    const offShopifySuccess = api.oauth.shopify.onSuccess(shopifySuccessCallback);
    const offShopifyError = api.oauth.shopify.onError(shopifyErrorCallback);
    const offGorgiasSuccess = api.oauth.gorgias.onSuccess(gorgiasSuccessCallback);
    const offZendeskError = api.oauth.zendesk.onError(zendeskErrorCallback);

    expect(mockOn).toHaveBeenCalledWith('oauth:shopify:success', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('oauth:shopify:error', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('oauth:gorgias:success', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('oauth:zendesk:error', expect.any(Function));

    const shopifySuccessListener = mockOn.mock.calls.find(
      (call) => call[0] === 'oauth:shopify:success'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const shopifyErrorListener = mockOn.mock.calls.find(
      (call) => call[0] === 'oauth:shopify:error'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const gorgiasSuccessListener = mockOn.mock.calls.find(
      (call) => call[0] === 'oauth:gorgias:success'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const zendeskErrorListener = mockOn.mock.calls.find(
      (call) => call[0] === 'oauth:zendesk:error'
    )?.[1] as (event: unknown, payload: unknown) => void;

    shopifySuccessListener({}, { ok: true });
    shopifyErrorListener({}, { reason: 'shopify-error' });
    gorgiasSuccessListener({}, { token: 'abc' });
    zendeskErrorListener({}, { reason: 'zendesk-error' });

    expect(shopifySuccessCallback).toHaveBeenCalledWith({ ok: true });
    expect(shopifyErrorCallback).toHaveBeenCalledWith({ reason: 'shopify-error' });
    expect(gorgiasSuccessCallback).toHaveBeenCalledWith({ token: 'abc' });
    expect(zendeskErrorCallback).toHaveBeenCalledWith({ reason: 'zendesk-error' });

    offShopifySuccess();
    offShopifyError();
    offGorgiasSuccess();
    offZendeskError();

    expect(mockRemoveListener).toHaveBeenCalledWith(
      'oauth:shopify:success',
      shopifySuccessListener
    );
    expect(mockRemoveListener).toHaveBeenCalledWith('oauth:shopify:error', shopifyErrorListener);
    expect(mockRemoveListener).toHaveBeenCalledWith(
      'oauth:gorgias:success',
      gorgiasSuccessListener
    );
    expect(mockRemoveListener).toHaveBeenCalledWith('oauth:zendesk:error', zendeskErrorListener);
  });

  it('registers updater listeners and removes them via unsubscribe', async () => {
    const api = await loadPreload();
    const onChecking = vi.fn();
    const onAvailable = vi.fn();
    const onNotAvailable = vi.fn();
    const onProgress = vi.fn();
    const onDownloaded = vi.fn();
    const onError = vi.fn();

    const offChecking = api.app.onUpdateChecking(onChecking);
    const offAvailable = api.app.onUpdateAvailable(onAvailable);
    const offNotAvailable = api.app.onUpdateNotAvailable(onNotAvailable);
    const offProgress = api.app.onUpdateProgress(onProgress);
    const offDownloaded = api.app.onUpdateDownloaded(onDownloaded);
    const offError = api.app.onUpdateError(onError);

    const checkingListener = mockOn.mock.calls.find(
      (call) => call[0] === 'updater:checking'
    )?.[1] as (event: unknown) => void;
    const availableListener = mockOn.mock.calls.find(
      (call) => call[0] === 'updater:available'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const notAvailableListener = mockOn.mock.calls.find(
      (call) => call[0] === 'updater:not-available'
    )?.[1] as (event: unknown) => void;
    const progressListener = mockOn.mock.calls.find(
      (call) => call[0] === 'updater:progress'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const downloadedListener = mockOn.mock.calls.find(
      (call) => call[0] === 'updater:downloaded'
    )?.[1] as (event: unknown, payload: unknown) => void;
    const errorListener = mockOn.mock.calls.find((call) => call[0] === 'updater:error')?.[1] as (
      event: unknown,
      payload: string
    ) => void;

    checkingListener({});
    availableListener({}, { version: '1.2.3' });
    notAvailableListener({});
    progressListener({}, { percent: 42 });
    downloadedListener({}, { version: '1.2.3' });
    errorListener({}, 'failed');

    expect(onChecking).toHaveBeenCalled();
    expect(onAvailable).toHaveBeenCalledWith({ version: '1.2.3' });
    expect(onNotAvailable).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({ percent: 42 });
    expect(onDownloaded).toHaveBeenCalledWith({ version: '1.2.3' });
    expect(onError).toHaveBeenCalledWith('failed');

    offChecking();
    offAvailable();
    offNotAvailable();
    offProgress();
    offDownloaded();
    offError();

    expect(mockRemoveListener).toHaveBeenCalledWith('updater:checking', checkingListener);
    expect(mockRemoveListener).toHaveBeenCalledWith('updater:available', availableListener);
    expect(mockRemoveListener).toHaveBeenCalledWith('updater:not-available', notAvailableListener);
    expect(mockRemoveListener).toHaveBeenCalledWith('updater:progress', progressListener);
    expect(mockRemoveListener).toHaveBeenCalledWith('updater:downloaded', downloadedListener);
    expect(mockRemoveListener).toHaveBeenCalledWith('updater:error', errorListener);
  });

  it('forwards background and notification calls via ipcRenderer.invoke', async () => {
    const api = await loadPreload();

    await api.background.setMinimizeToTray(true);
    await api.background.getMinimizeToTray();
    await api.background.updateAgentStatus({ running: 2, total: 7 });
    await api.notifications.show({ title: 'Agent', body: 'Done' });

    expect(mockInvoke).toHaveBeenCalledWith('app:setMinimizeToTray', true);
    expect(mockInvoke).toHaveBeenCalledWith('app:getMinimizeToTray');
    expect(mockInvoke).toHaveBeenCalledWith('app:updateAgentStatus', { running: 2, total: 7 });
    expect(mockInvoke).toHaveBeenCalledWith('app:showNotification', {
      title: 'Agent',
      body: 'Done',
    });
  });

  it('sets app.isE2ETest from environment flags', async () => {
    process.env.E2E_TEST = 'true';
    const apiFromE2EFlag = await loadPreload();
    expect(apiFromE2EFlag.app.isE2ETest).toBe(true);

    delete process.env.E2E_TEST;
    process.env.PLAYWRIGHT_TEST = 'true';
    const apiFromPlaywrightFlag = await loadPreload();
    expect(apiFromPlaywrightFlag.app.isE2ETest).toBe(true);
  });

  describe('durable workflow transport', () => {
    it('dispatches scoped requests and explicit cancellation without exposing raw IPC', async () => {
      const api = await loadPreload();
      const request: import('./durable-workflow-bridge').DurableWorkflowRequest = {
        id: firstStreamId,
        engineUrl: 'https://engine.example.com',
        revision: 'connection-revision',
        tenantId: 'tenant-1',
        path: '/v1/workflows/active-horizon-agent/workflow-1/steer',
        method: 'POST',
        body: { note: 'Inspect the evidence first.' },
      };
      const response = { ok: false, status: 409, body: { error: 'Connection changed.' } };
      mockInvoke.mockResolvedValueOnce(response).mockResolvedValueOnce(true);

      await expect(api.durableWorkflows.request(request)).resolves.toEqual(response);
      await expect(api.durableWorkflows.cancel(firstStreamId)).resolves.toBe(true);
      expect(mockInvoke.mock.calls).toEqual([
        ['durable-workflows:request', request],
        ['durable-workflows:cancel', firstStreamId],
      ]);
      expect(Object.keys(api.durableWorkflows).sort()).toEqual(['cancel', 'request', 'stream']);
      expect(mockOn).not.toHaveBeenCalled();
    });

    it('registers before invoke, filters IDs and removes its own listener on completion', async () => {
      const api = await loadPreload();
      const pending = deferred<void>();
      const onEvent = vi.fn();
      const request = streamRequest();
      mockInvoke.mockImplementation((channel: string, submitted: unknown) => {
        expect(channel).toBe('durable-workflows:stream');
        expect(submitted).toEqual(request);
        expect(listeners.get('durable-workflows:event')?.size).toBe(1);
        emitWorkflowEvent(secondStreamId);
        emitWorkflowEvent(firstStreamId);
        return pending.promise;
      });

      const streaming = api.durableWorkflows.stream(request, onEvent);
      expect(onEvent.mock.calls).toEqual([[workflowEvent]]);
      expect(mockRemoveListener).not.toHaveBeenCalled();
      const listener = mockOn.mock.calls[0][1];
      pending.resolve();
      await expect(streaming).resolves.toBeUndefined();
      expect(mockRemoveListener.mock.calls).toEqual([['durable-workflows:event', listener]]);
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      emitWorkflowEvent(firstStreamId);
      expect(onEvent).toHaveBeenCalledOnce();
    });

    it.each(['rejection', 'synchronous throw'] as const)(
      'cleans up a failed stream invoke (%s)',
      async (failure) => {
        const api = await loadPreload();
        const error = new Error('Native stream unavailable.');
        mockInvoke.mockImplementation(() => {
          if (failure === 'synchronous throw') throw error;
          return Promise.reject(error);
        });
        const onEvent = vi.fn();
        await expect(api.durableWorkflows.stream(streamRequest(), onEvent)).rejects.toBe(error);
        expect(mockRemoveListener.mock.calls).toEqual([
          ['durable-workflows:event', mockOn.mock.calls[0][1]],
        ]);
        expect(listeners.get('durable-workflows:event')?.size).toBe(0);
        emitWorkflowEvent(firstStreamId);
        expect(onEvent).not.toHaveBeenCalled();
      }
    );

    it('isolates simultaneous streams and does not remove another stream on cancellation', async () => {
      const api = await loadPreload();
      const first = deferred<void>();
      const second = deferred<void>();
      mockInvoke.mockImplementation((channel: string, request: { id?: string } | string) => {
        if (channel === 'durable-workflows:cancel') {
          first.resolve();
          return Promise.resolve(true);
        }
        return typeof request !== 'string' && request.id === firstStreamId
          ? first.promise
          : second.promise;
      });
      const firstEvent = vi.fn();
      const secondEvent = vi.fn();
      const firstStreaming = api.durableWorkflows.stream(streamRequest(), firstEvent);
      const secondStreaming = api.durableWorkflows.stream(
        streamRequest(secondStreamId),
        secondEvent
      );
      expect(listeners.get('durable-workflows:event')?.size).toBe(2);
      emitWorkflowEvent(firstStreamId);
      expect(firstEvent.mock.calls).toEqual([[workflowEvent]]);
      expect(secondEvent).not.toHaveBeenCalled();
      emitWorkflowEvent(secondStreamId, { ...workflowEvent, event_id: 43 });
      expect(secondEvent.mock.calls).toEqual([[{ ...workflowEvent, event_id: 43 }]]);

      await expect(api.durableWorkflows.cancel(firstStreamId)).resolves.toBe(true);
      await firstStreaming;
      expect(listeners.get('durable-workflows:event')?.size).toBe(1);
      expect(mockRemoveListener.mock.calls).toEqual([
        ['durable-workflows:event', mockOn.mock.calls[0][1]],
      ]);
      emitWorkflowEvent(firstStreamId);
      emitWorkflowEvent(secondStreamId, { ...workflowEvent, event_id: 44 });
      expect(firstEvent).toHaveBeenCalledOnce();
      expect(secondEvent).toHaveBeenCalledTimes(2);
      second.resolve();
      await secondStreaming;
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      expect(mockRemoveListener.mock.calls[1]).toEqual([
        'durable-workflows:event',
        mockOn.mock.calls[1][1],
      ]);
    });

    it.each(['resolve', 'reject'] as const)(
      'rejects callback failures immediately and observes a later native %s',
      async (completion) => {
        const api = await loadPreload();
        const native = deferred<void>();
        const callbackError = new Error('Renderer event handler failed.');
        mockInvoke.mockImplementation((channel: string) =>
          channel === 'durable-workflows:cancel' ? Promise.resolve(true) : native.promise
        );
        const onEvent = vi.fn(() => {
          throw callbackError;
        });
        const streaming = api.durableWorkflows.stream(streamRequest(), onEvent);
        const rejected = expect(streaming).rejects.toBe(callbackError);
        emitWorkflowEvent(firstStreamId);
        await rejected;
        expect(mockInvoke).toHaveBeenCalledWith('durable-workflows:cancel', firstStreamId);
        expect(listeners.get('durable-workflows:event')?.size).toBe(0);
        expect(mockRemoveListener).toHaveBeenCalledOnce();
        emitWorkflowEvent(firstStreamId);
        expect(onEvent).toHaveBeenCalledOnce();
        if (completion === 'resolve') native.resolve();
        else native.reject(new Error('Native rejection after renderer failure.'));
        await Promise.resolve();
        await Promise.resolve();
        expect(mockRemoveListener).toHaveBeenCalledOnce();
      }
    );

    it.each(['rejection', 'synchronous throw'] as const)(
      'keeps the callback failure authoritative when cancellation fails (%s)',
      async (failure) => {
        const api = await loadPreload();
        const native = deferred<void>();
        const callbackError = new Error('Renderer callback failed.');
        mockInvoke.mockImplementation((channel: string) => {
          if (channel !== 'durable-workflows:cancel') return native.promise;
          if (failure === 'synchronous throw') throw new Error('Cancel IPC unavailable.');
          return Promise.reject(new Error('Cancel IPC unavailable.'));
        });
        const streaming = api.durableWorkflows.stream(streamRequest(), () => {
          throw callbackError;
        });
        const rejected = expect(streaming).rejects.toBe(callbackError);
        emitWorkflowEvent(firstStreamId);
        await rejected;
        native.reject(new Error('Late native failure.'));
        await Promise.resolve();
        await Promise.resolve();
        expect(listeners.get('durable-workflows:event')?.size).toBe(0);
        expect(mockRemoveListener).toHaveBeenCalledOnce();
      }
    );

    it('observes native rejection when a callback fails synchronously during invoke', async () => {
      const api = await loadPreload();
      const callbackError = new Error('Immediate event callback failed.');
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'durable-workflows:cancel') return Promise.resolve(true);
        emitWorkflowEvent(firstStreamId);
        return Promise.reject(new Error('Native invocation failed afterwards.'));
      });
      await expect(
        api.durableWorkflows.stream(streamRequest(), () => {
          throw callbackError;
        })
      ).rejects.toBe(callbackError);
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      expect(mockRemoveListener).toHaveBeenCalledOnce();
      expect(mockInvoke).toHaveBeenCalledWith('durable-workflows:cancel', firstStreamId);
    });

    it('observes a rejected callback promise even if native streaming has already completed', async () => {
      const api = await loadPreload();
      const native = deferred<void>();
      const callback = deferred<void>();
      const error = new Error('Async event callback failed.');
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'durable-workflows:cancel' ? Promise.resolve(true) : native.promise
      );
      const streaming = api.durableWorkflows.stream(streamRequest(), () => callback.promise);
      const rejected = expect(streaming).rejects.toBe(error);
      emitWorkflowEvent(firstStreamId);
      native.resolve();
      await Promise.resolve();
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      callback.reject(error);
      await rejected;
      expect(mockInvoke).toHaveBeenCalledWith('durable-workflows:cancel', firstStreamId);
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      expect(mockRemoveListener).toHaveBeenCalledOnce();
    });

    it('detaches at native EOF while a callback remains pending, even when cancellation finds no active stream', async () => {
      const api = await loadPreload();
      const native = deferred<void>();
      const callback = deferred<void>();
      mockInvoke.mockImplementation((channel: string) =>
        channel === 'durable-workflows:cancel' ? Promise.resolve(false) : native.promise
      );
      const onEvent = vi.fn(() => callback.promise);
      const streaming = api.durableWorkflows.stream(streamRequest(), onEvent);
      let settled = false;
      void streaming.then(() => {
        settled = true;
      });
      const queuedListener = mockOn.mock.calls[0][1] as IpcListener;
      emitWorkflowEvent(firstStreamId);
      native.resolve();
      await native.promise;
      expect(settled).toBe(false);
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      expect(mockRemoveListener).toHaveBeenCalledOnce();
      await expect(api.durableWorkflows.cancel(firstStreamId)).resolves.toBe(false);
      emitWorkflowEvent(firstStreamId);
      queuedListener({}, firstStreamId, workflowEvent);
      expect(onEvent).toHaveBeenCalledOnce();
      expect(settled).toBe(false);
      callback.resolve();
      await expect(streaming).resolves.toBeUndefined();
      expect(mockRemoveListener).toHaveBeenCalledOnce();
    });

    it('retains another stream when one event callback fails', async () => {
      const api = await loadPreload();
      const first = deferred<void>();
      const second = deferred<void>();
      const error = new Error('First stream callback failed.');
      mockInvoke.mockImplementation((channel: string, request: { id?: string }) => {
        if (channel === 'durable-workflows:cancel') return Promise.resolve(true);
        return request.id === firstStreamId ? first.promise : second.promise;
      });
      const failing = api.durableWorkflows.stream(streamRequest(), () => {
        throw error;
      });
      const rejected = expect(failing).rejects.toBe(error);
      const onSecondEvent = vi.fn();
      const surviving = api.durableWorkflows.stream(streamRequest(secondStreamId), onSecondEvent);
      emitWorkflowEvent(firstStreamId);
      await rejected;
      expect(listeners.get('durable-workflows:event')?.size).toBe(1);
      emitWorkflowEvent(secondStreamId);
      expect(onSecondEvent.mock.calls).toEqual([[workflowEvent]]);
      first.reject(new Error('Late failure of the first native stream.'));
      second.resolve();
      await surviving;
      expect(listeners.get('durable-workflows:event')?.size).toBe(0);
      expect(mockRemoveListener.mock.calls.map((call) => call[1])).toEqual(
        mockOn.mock.calls.map((call) => call[1])
      );
    });
  });
});
