/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ToastProvider';
import { useAuthStore } from '../stores/auth';
import Dashboard from './Dashboard';

vi.mock('../lib/api', () => ({
  agentApi: {
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => ({})),
    startSession: vi.fn(async () => ({})),
    stopSession: vi.fn(async () => undefined),
  },
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderDashboard(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          initialEntries={[initialEntry]}
        >
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <LocationDisplay />
                  <Dashboard />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Dashboard deep links', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'sk-test',
      sandboxApiKey: null,
      tenant: {
        id: 'tenant-1',
        name: 'Test Tenant',
        slug: 'test-tenant',
        tier: 'pro',
        created_at: '2024-01-01T00:00:00Z',
      },
      currentBrand: {
        id: 'brand-1',
        tenant_id: 'tenant-1',
        slug: 'brand-1',
        name: 'Test Brand',
        support_platform: 'gorgias',
        ecommerce_platform: 'shopify',
        config: {},
        mcp_servers: [],
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
      },
      brands: [],
      error: null,
      initAttempts: 0,
    });
  });

  it('opens Create Agent dialog and clears ?create=1 from the URL', async () => {
    renderDashboard('/?create=1');

    const dialog = await screen.findByRole('dialog', { name: /create new agent/i });
    expect(dialog).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('');
    });
  });
});
