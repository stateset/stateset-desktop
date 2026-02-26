/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Brand, Tenant } from '../types';
import Layout from './Layout';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import { useNotificationsStore } from '../stores/notifications';
import { useAuditLogStore } from '../stores/auditLog';

const listSessionsMock = vi.fn().mockResolvedValue([]);

vi.mock('../lib/api', () => ({
  agentApi: {
    listSessions: (...args: unknown[]) => listSessionsMock(...args),
  },
}));

vi.mock('../hooks/useOfflineCache', () => ({
  useSessionsCache: () => ({
    isOnline: true,
    cacheFromQuery: vi.fn().mockResolvedValue(undefined),
    getCachedSessions: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      variants: _variants,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => <div {...rest}>{children}</div>,
    main: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      variants: _variants,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => <main {...rest}>{children}</main>,
  },
  useReducedMotion: () => true,
}));

vi.mock('./ApiHealthIndicator', () => ({
  ApiHealthIndicator: () => <div data-testid="api-health" />,
}));

vi.mock('./CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('./KeyboardShortcutsModal', () => ({
  KeyboardShortcutsModal: () => null,
}));

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock('./NotificationsCenter', () => ({
  NotificationsCenter: () => <div data-testid="notifications-center" />,
}));

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

const enabledBrandTwo: Brand = {
  ...enabledBrand,
  id: 'brand-2',
  slug: 'brand-two',
  name: 'Brand Two',
};

const disabledBrand: Brand = {
  ...enabledBrand,
  id: 'brand-3',
  slug: 'brand-three',
  name: 'Brand Three',
  enabled: false,
};

function createElectronApiMock() {
  return {
    auth: {
      getApiKey: vi.fn().mockResolvedValue(undefined),
      setApiKey: vi.fn().mockResolvedValue(true),
      clearApiKey: vi.fn().mockResolvedValue(true),
      getSandboxApiKey: vi.fn().mockResolvedValue(undefined),
      setSandboxApiKey: vi.fn().mockResolvedValue(true),
      clearSandboxApiKey: vi.fn().mockResolvedValue(true),
      isSecureStorageAvailable: vi.fn().mockResolvedValue(true),
    },
    store: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(true),
    },
    oauth: {
      shopify: {
        start: vi.fn().mockResolvedValue(undefined),
        onSuccess: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
      },
      gorgias: {
        start: vi.fn().mockResolvedValue(undefined),
        onSuccess: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
      },
      zendesk: {
        start: vi.fn().mockResolvedValue(undefined),
        onSuccess: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
      },
    },
    secrets: {
      getLocal: vi.fn().mockResolvedValue(undefined),
      setLocal: vi.fn().mockResolvedValue(true),
      clearLocal: vi.fn().mockResolvedValue(true),
    },
    window: {
      minimize: vi.fn().mockResolvedValue(undefined),
      maximize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
    app: {
      // Intentionally omit getVersion to avoid async state updates unrelated to these tests.
    },
    background: {
      setMinimizeToTray: vi.fn().mockResolvedValue(true),
      getMinimizeToTray: vi.fn().mockResolvedValue(true),
      updateAgentStatus: vi.fn().mockResolvedValue(true),
    },
    notifications: {
      show: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Window['electronAPI'];
}

function renderLayout(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<div>Login Route</div>} />
          <Route
            path="*"
            element={
              <Layout>
                <div>Layout Body</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return client;
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ commandPaletteOpen: false, commandPaletteAgents: [] });
    useNotificationsStore.setState({ notifications: [] });
    useAuditLogStore.setState({ entries: [], isLoaded: true });

    Object.defineProperty(window, 'electronAPI', {
      value: createElectronApiMock(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows enabled and disabled brands and blocks disabled selection', async () => {
    const setCurrentBrand = vi.fn();
    const logout = vi.fn().mockResolvedValue(undefined);
    const logSpy = vi.spyOn(useAuditLogStore.getState(), 'log');

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrand,
      brands: [enabledBrand, enabledBrandTwo, disabledBrand],
      error: null,
      initAttempts: 0,
      setCurrentBrand,
      logout,
    });

    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));

    const enabledOption = screen.getByRole('option', { name: enabledBrandTwo.name });
    const disabledOption = screen.getByRole('option', { name: new RegExp(disabledBrand.name) });

    expect(enabledOption).toBeEnabled();
    expect(disabledOption).toBeDisabled();

    fireEvent.click(disabledOption);
    expect(setCurrentBrand).not.toHaveBeenCalledWith(disabledBrand);

    fireEvent.click(enabledOption);

    await waitFor(() => {
      expect(setCurrentBrand).toHaveBeenCalledWith(enabledBrandTwo);
    });
    expect(logSpy).toHaveBeenCalledWith(
      'brand.switched',
      `Switched to brand "${enabledBrandTwo.name}"`,
      { brandId: enabledBrandTwo.id }
    );
    expect(screen.queryByRole('listbox', { name: /available brands/i })).not.toBeInTheDocument();
  });

  it('shows no-active-brands state when all brands are disabled', () => {
    const setCurrentBrand = vi.fn();
    const logout = vi.fn().mockResolvedValue(undefined);

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: null,
      brands: [disabledBrand],
      error: null,
      initAttempts: 0,
      setCurrentBrand,
      logout,
    });

    renderLayout();

    expect(screen.getByRole('button', { name: /select brand/i })).toHaveTextContent(
      'No Active Brands'
    );

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));

    expect(screen.getByText('No active brands available for agent actions.')).toBeInTheDocument();
    const disabledOption = screen.getByRole('option', { name: new RegExp(disabledBrand.name) });
    expect(disabledOption).toBeDisabled();
    expect(setCurrentBrand).not.toHaveBeenCalled();
  });

  it('logs out, clears query cache, and navigates to login', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const setCurrentBrand = vi.fn();

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
      setCurrentBrand,
      logout,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const clearSpy = vi.spyOn(queryClient, 'clear');

    renderLayout(queryClient);

    fireEvent.click(screen.getByRole('button', { name: /logout from stateset/i }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Login Route')).toBeInTheDocument();
  });
});
