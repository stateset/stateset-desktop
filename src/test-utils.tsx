import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ToastProvider } from './components/ToastProvider';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient, ...renderOptions }: RenderWithProvidersOptions = {}
) {
  const testQueryClient =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={[route]}>
          <ToastProvider>{children}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient: testQueryClient };
}

export function mockElectronAPI() {
  const electronAPI = {
    auth: {
      getApiKey: vi.fn().mockResolvedValue(null),
      setApiKey: vi.fn().mockResolvedValue(undefined),
      clearApiKey: vi.fn().mockResolvedValue(undefined),
      getSandboxApiKey: vi.fn().mockResolvedValue(null),
      setSandboxApiKey: vi.fn().mockResolvedValue(undefined),
      clearSandboxApiKey: vi.fn().mockResolvedValue(undefined),
      isSecureStorageAvailable: vi.fn().mockResolvedValue(true),
    },
    store: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
    app: {
      getVersion: vi.fn().mockReturnValue('1.0.0-test'),
      getPlatform: vi.fn().mockReturnValue('linux'),
      checkForUpdates: vi.fn().mockResolvedValue(null),
      isE2ETest: false,
    },
  };

  Object.defineProperty(window, 'electronAPI', {
    value: electronAPI,
    writable: true,
    configurable: true,
  });

  return electronAPI;
}

export { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
export { renderHook } from '@testing-library/react';
