import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
const mockExposeInMainWorld = vi.fn();

let exposedApi: Record<string, unknown> | undefined;

interface PreloadApi {
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
    isSecureStorageAvailable: () => Promise<boolean>;
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
  mockInvoke.mockClear();
  mockOn.mockClear();
  mockRemoveListener.mockClear();
  exposedApi = undefined;

  await import('./preload');
  return exposedApi as unknown as PreloadApi;
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
    await api.auth.isSecureStorageAvailable();

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
    expect(mockInvoke).toHaveBeenCalledWith('auth:isSecureStorageAvailable');
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
});
