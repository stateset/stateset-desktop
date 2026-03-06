import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSandboxApiKey, useAuthStore } from './auth';
import type { Brand, Tenant } from '../types';

const mockLog = vi.fn();

vi.mock('./auditLog', () => ({
  useAuditLogStore: {
    getState: () => ({ log: mockLog }),
  },
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;
vi.stubGlobal('window', {} as Window);

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Tenant One',
  slug: 'tenant-one',
  tier: 'pro',
  created_at: '2026-02-26T00:00:00Z',
};

const enabledBrand: Brand = {
  id: 'brand-1',
  tenant_id: tenant.id,
  slug: 'brand-one',
  name: 'Brand One',
  support_platform: 'gorgias',
  ecommerce_platform: 'shopify',
  config: {},
  mcp_servers: [],
  enabled: true,
  created_at: '2026-02-26T00:00:00Z',
};

const disabledBrand: Brand = {
  ...enabledBrand,
  id: 'brand-2',
  slug: 'brand-two',
  name: 'Brand Two',
  enabled: false,
};

const enabledBrandTwo: Brand = {
  ...enabledBrand,
  id: 'brand-3',
  slug: 'brand-three',
  name: 'Brand Three',
};

type ElectronApiMock = NonNullable<Window['electronAPI']>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function createElectronApiMock(overrides: DeepPartial<ElectronApiMock> = {}): ElectronApiMock {
  const auth: ElectronApiMock['auth'] = {
    getApiKey: vi.fn().mockResolvedValue(undefined),
    setApiKey: vi.fn().mockResolvedValue(true),
    clearApiKey: vi.fn().mockResolvedValue(true),
    isSecureStorageAvailable: vi.fn().mockResolvedValue(true),
    getSandboxApiKey: vi.fn().mockResolvedValue(undefined),
    setSandboxApiKey: vi.fn().mockResolvedValue(true),
    clearSandboxApiKey: vi.fn().mockResolvedValue(true),
    ...(overrides.auth ?? {}),
  } as ElectronApiMock['auth'];

  const store: ElectronApiMock['store'] = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
    ...(overrides.store ?? {}),
  } as ElectronApiMock['store'];

  const oauth: ElectronApiMock['oauth'] = {
    shopify: {
      start: vi.fn().mockResolvedValue(undefined),
      onSuccess: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      ...(overrides.oauth?.shopify ?? {}),
    } as ElectronApiMock['oauth']['shopify'],
    gorgias: {
      start: vi.fn().mockResolvedValue(undefined),
      onSuccess: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      ...(overrides.oauth?.gorgias ?? {}),
    } as ElectronApiMock['oauth']['gorgias'],
    zendesk: {
      start: vi.fn().mockResolvedValue(undefined),
      onSuccess: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      ...(overrides.oauth?.zendesk ?? {}),
    } as ElectronApiMock['oauth']['zendesk'],
  };

  const secrets: ElectronApiMock['secrets'] = {
    getLocal: vi.fn().mockResolvedValue(undefined),
    setLocal: vi.fn().mockResolvedValue(true),
    clearLocal: vi.fn().mockResolvedValue(true),
    ...(overrides.secrets ?? {}),
  } as ElectronApiMock['secrets'];

  const windowControls: ElectronApiMock['window'] = {
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...(overrides.window ?? {}),
  } as ElectronApiMock['window'];

  const app: ElectronApiMock['app'] = {
    getVersion: vi.fn().mockResolvedValue('1.0.0-test'),
    getPlatform: vi.fn().mockResolvedValue('linux'),
    checkForUpdates: vi.fn().mockResolvedValue({ available: false }),
    installUpdate: vi.fn().mockResolvedValue(true),
    getUpdateStatus: vi.fn().mockResolvedValue({ checking: false }),
    isE2ETest: false,
    onUpdateChecking: vi.fn().mockReturnValue(() => {}),
    onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
    onUpdateNotAvailable: vi.fn().mockReturnValue(() => {}),
    onUpdateProgress: vi.fn().mockReturnValue(() => {}),
    onUpdateDownloaded: vi.fn().mockReturnValue(() => {}),
    onUpdateError: vi.fn().mockReturnValue(() => {}),
    ...(overrides.app ?? {}),
  } as ElectronApiMock['app'];

  const background: ElectronApiMock['background'] = {
    setMinimizeToTray: vi.fn().mockResolvedValue(true),
    getMinimizeToTray: vi.fn().mockResolvedValue(true),
    updateAgentStatus: vi.fn().mockResolvedValue(true),
    ...(overrides.background ?? {}),
  } as ElectronApiMock['background'];

  const notifications: ElectronApiMock['notifications'] = {
    show: vi.fn().mockResolvedValue(true),
    ...(overrides.notifications ?? {}),
  } as ElectronApiMock['notifications'];

  return {
    auth,
    store,
    oauth,
    secrets,
    window: windowControls,
    app,
    background,
    notifications,
  };
}

function setElectronApi(api?: ElectronApiMock): void {
  Object.defineProperty(window, 'electronAPI', {
    value: api,
    configurable: true,
    writable: true,
  });
}

function resetStore() {
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    apiKey: null,
    sandboxApiKey: null,
    tenant: null,
    currentBrand: null,
    brands: [],
    error: null,
    initAttempts: 0,
  });
}

describe('normalizeSandboxApiKey', () => {
  it('returns null for empty or placeholder values', () => {
    expect(normalizeSandboxApiKey()).toBeNull();
    expect(normalizeSandboxApiKey('')).toBeNull();
    expect(normalizeSandboxApiKey('   ')).toBeNull();
    expect(normalizeSandboxApiKey('placeholder')).toBeNull();
    expect(normalizeSandboxApiKey('PENDING')).toBeNull();
  });

  it('returns trimmed valid key', () => {
    expect(normalizeSandboxApiKey('  sandbox-key-123  ')).toBe('sandbox-key-123');
  });
});

describe('useAuthStore', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    delete window.__E2E_AUTH__;
    resetStore();
    setElectronApi(createElectronApiMock());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('initializes without electron api in browser mode', async () => {
    setElectronApi(undefined);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets STORAGE_ERROR when credentials cannot be read', async () => {
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockRejectedValue(new Error('keychain unavailable')),
      },
    });
    setElectronApi(api);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().error).toMatchObject({
      code: 'STORAGE_ERROR',
    });
  });

  it('uses e2e auth payload when app is in e2e mode', async () => {
    const api = createElectronApiMock({
      app: {
        isE2ETest: true,
      },
      auth: {
        getApiKey: vi.fn().mockResolvedValue(undefined),
        getSandboxApiKey: vi.fn().mockResolvedValue('sandbox-key'),
      },
    });
    setElectronApi(api);
    window.__E2E_AUTH__ = { tenant, brands: [enabledBrand] };

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().tenant?.id).toBe(tenant.id);
    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrand.id);
  });

  it('clears invalid stored sandbox key during initialize', async () => {
    const clearSandboxApiKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue(undefined),
        getSandboxApiKey: vi.fn().mockResolvedValue('placeholder'),
        clearSandboxApiKey,
      },
    });
    setElectronApi(api);

    await useAuthStore.getState().initialize();

    expect(clearSandboxApiKey).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().sandboxApiKey).toBeNull();
  });

  it('initializes authenticated user when stored key validates', async () => {
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
        getSandboxApiKey: vi.fn().mockResolvedValue('sandbox-key'),
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [disabledBrand, enabledBrand],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.apiKey).toBe('engine-key');
    expect(state.sandboxApiKey).toBe('sandbox-key');
    expect(state.currentBrand?.id).toBe(enabledBrand.id);
  });

  it('restores persisted brand selection during initialize', async () => {
    const storeGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'currentBrandId') {
        return Promise.resolve(enabledBrandTwo.id);
      }
      return Promise.resolve(undefined);
    });
    const storeSet = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
      },
      store: {
        get: storeGet,
        set: storeSet,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [enabledBrand, enabledBrandTwo],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandTwo.id);
    expect(storeGet).toHaveBeenCalledWith('currentBrandId');
    expect(storeSet).toHaveBeenCalledWith('currentBrandId', enabledBrandTwo.id);
  });

  it('falls back to enabled brand when persisted selection is disabled', async () => {
    const storeSet = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
      },
      store: {
        get: vi.fn().mockResolvedValue(disabledBrand.id),
        set: storeSet,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [disabledBrand, enabledBrand],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrand.id);
    expect(storeSet).toHaveBeenCalledWith('currentBrandId', enabledBrand.id);
  });

  it('does not select a brand when all brands are disabled', async () => {
    const storeDelete = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
      },
      store: {
        get: vi.fn().mockResolvedValue(disabledBrand.id),
        delete: storeDelete,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [disabledBrand],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.currentBrand).toBeNull();
    expect(storeDelete).toHaveBeenCalledWith('currentBrandId');
  });

  it('clears stored key and sets SESSION_EXPIRED on 401 during initialize', async () => {
    const clearApiKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
        clearApiKey,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    await useAuthStore.getState().initialize();

    expect(clearApiKey).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().error?.code).toBe('SESSION_EXPIRED');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('enters offline mode when key validation fetch fails', async () => {
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
      },
    });
    setElectronApi(api);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.error?.code).toBe('NETWORK_ERROR');
  });

  it('keeps cached credentials when auth validation returns 500', async () => {
    const api = createElectronApiMock({
      auth: {
        getApiKey: vi.fn().mockResolvedValue('engine-key'),
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.apiKey).toBe('engine-key');
    expect(state.error?.code).toBe('SERVER_ERROR');
  });

  it('rejects invalid api key format on login', async () => {
    await expect(useAuthStore.getState().login('short')).rejects.toThrow('Invalid API key format');
    expect(useAuthStore.getState().error?.code).toBe('INVALID_API_KEY');
  });

  it('logs in successfully and persists api key', async () => {
    const setApiKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        setApiKey,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [disabledBrand, enabledBrand],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().login('1234567890-valid-key');

    const state = useAuthStore.getState();
    expect(setApiKey).toHaveBeenCalledWith('1234567890-valid-key');
    expect(state.isAuthenticated).toBe(true);
    expect(state.currentBrand?.id).toBe(enabledBrand.id);
    expect(mockLog).toHaveBeenCalledWith('user.login', expect.stringContaining('Tenant One'));
  });

  it('uses persisted brand selection during login', async () => {
    const setApiKey = vi.fn().mockResolvedValue(true);
    const storeGet = vi.fn().mockResolvedValue(enabledBrandTwo.id);
    const storeSet = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        setApiKey,
      },
      store: {
        get: storeGet,
        set: storeSet,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant,
          brands: [enabledBrand, enabledBrandTwo],
        }),
        { status: 200 }
      )
    );

    await useAuthStore.getState().login('1234567890-valid-key');

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandTwo.id);
    expect(storeGet).toHaveBeenCalledWith('currentBrandId');
    expect(storeSet).toHaveBeenCalledWith('currentBrandId', enabledBrandTwo.id);
  });

  it('uses fallback login data when server returns 5xx', async () => {
    const setApiKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        setApiKey,
      },
    });
    setElectronApi(api);
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await useAuthStore.getState().login('1234567890-valid-key', {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        tier: tenant.tier,
      },
      brands: [enabledBrand],
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.tenant?.id).toBe(tenant.id);
    expect(setApiKey).toHaveBeenCalledTimes(1);
  });

  it('sets invalid key error when login receives 401', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    await expect(useAuthStore.getState().login('1234567890-valid-key')).rejects.toThrow(
      'Invalid or expired API key'
    );
    expect(useAuthStore.getState().error?.code).toBe('INVALID_API_KEY');
  });

  it('maps network fetch failures to NETWORK_ERROR on login', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(useAuthStore.getState().login('1234567890-valid-key')).rejects.toThrow(
      'Unable to connect to server'
    );
    expect(useAuthStore.getState().error?.code).toBe('NETWORK_ERROR');
  });

  it('supports sandbox key set/clear actions', async () => {
    const setSandboxApiKey = vi.fn().mockResolvedValue(true);
    const clearSandboxApiKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        setSandboxApiKey,
        clearSandboxApiKey,
      },
    });
    setElectronApi(api);

    await useAuthStore.getState().setSandboxApiKey('  sandbox-key  ');
    expect(setSandboxApiKey).toHaveBeenCalledWith('sandbox-key');
    expect(useAuthStore.getState().sandboxApiKey).toBe('sandbox-key');

    await useAuthStore.getState().setSandboxApiKey('placeholder');
    expect(clearSandboxApiKey).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().sandboxApiKey).toBeNull();

    await useAuthStore.getState().clearSandboxApiKey();
    expect(clearSandboxApiKey).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().sandboxApiKey).toBeNull();
  });

  it('persists selected brand when switching brands', async () => {
    const storeSet = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      store: {
        set: storeSet,
      },
    });
    setElectronApi(api);
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrand,
      brands: [enabledBrand, enabledBrandTwo],
      error: null,
      initAttempts: 0,
    });

    useAuthStore.getState().setCurrentBrand(enabledBrandTwo);
    await Promise.resolve();

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandTwo.id);
    expect(storeSet).toHaveBeenCalledWith('currentBrandId', enabledBrandTwo.id);
  });

  it('ignores attempts to switch to a disabled brand', async () => {
    const storeSet = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      store: {
        set: storeSet,
      },
    });
    setElectronApi(api);
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrand,
      brands: [enabledBrand, disabledBrand],
      error: null,
      initAttempts: 0,
    });

    useAuthStore.getState().setCurrentBrand(disabledBrand);
    await Promise.resolve();

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrand.id);
    expect(storeSet).not.toHaveBeenCalledWith('currentBrandId', disabledBrand.id);
  });

  it('clears selected brand when brands list contains no enabled brands', async () => {
    const storeDelete = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      store: {
        delete: storeDelete,
      },
    });
    setElectronApi(api);

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrand,
      brands: [enabledBrand],
      error: null,
      initAttempts: 0,
    });

    useAuthStore.getState().setBrands([disabledBrand]);
    await Promise.resolve();

    expect(useAuthStore.getState().currentBrand).toBeNull();
    expect(storeDelete).toHaveBeenCalledWith('currentBrandId');
  });

  it('logs out and clears persisted credentials', async () => {
    const clearApiKey = vi.fn().mockResolvedValue(true);
    const clearSandboxApiKey = vi.fn().mockResolvedValue(true);
    const deleteStoreKey = vi.fn().mockResolvedValue(true);
    const api = createElectronApiMock({
      auth: {
        clearApiKey,
        clearSandboxApiKey,
      },
      store: {
        delete: deleteStoreKey,
      },
    });
    setElectronApi(api);

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: 'sandbox-key',
      tenant,
      currentBrand: enabledBrand,
      brands: [enabledBrand],
      error: null,
      initAttempts: 0,
    });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(clearApiKey).toHaveBeenCalledTimes(1);
    expect(clearSandboxApiKey).toHaveBeenCalledTimes(1);
    expect(deleteStoreKey).toHaveBeenCalledWith('currentBrandId');
    expect(state.isAuthenticated).toBe(false);
    expect(state.apiKey).toBeNull();
    expect(state.sandboxApiKey).toBeNull();
    expect(state.tenant).toBeNull();
    expect(state.brands).toEqual([]);
    expect(mockLog).toHaveBeenCalledWith('user.logout', 'User logged out');
  });
});
