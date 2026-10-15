/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ToastProvider';
import { useAuthStore } from '../stores/auth';
import Dashboard from './Dashboard';
import { agentApi } from '../lib/api';
import { usePreferencesStore } from '../stores/preferences';
import { makeSession } from '../features/dashboard/testing/fixtures';
import { queryKeys } from '../lib/queryKeys';
import { useOnlineStatus } from '../hooks/useOfflineCache';

vi.mock('../hooks/useOfflineCache', () => ({
  useOnlineStatus: vi.fn(() => true),
  useSessionsCache: () => ({
    cacheFromQuery: async () => undefined,
    getCachedSessions: async () => null,
  }),
}));

vi.mock('../features/connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => [
    {
      id: 'stateset-sync',
      name: 'StateSet Sync',
      isLocalOnly: false,
      isMcpServer: true,
      connected: true,
      toolCount: 3,
      verifiedAt: new Date().toISOString(),
    },
  ],
  useMcpServerOptionsState: () => ({
    options: [
      {
        id: 'stateset-sync',
        name: 'StateSet Sync',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
        toolCount: 3,
        verifiedAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
  }),
}));

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
  return { queryClient };
}

describe('Dashboard deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentApi.listSessions).mockResolvedValue([]);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    usePreferencesStore.setState({ pageSize: 10 });
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

  it('shows the MCP servers overview in the sidebar', async () => {
    renderDashboard('/');

    expect(await screen.findByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-connected')).toHaveTextContent('1');
    expect(screen.getByText('3 tools available')).toBeInTheDocument();
  });

  it('clears bulk selection when changing pages and does not restore it on return', async () => {
    const sessions = Array.from({ length: 15 }, (_, index) =>
      makeSession({ id: `agent-${index}`, name: `Agent ${index + 1}` })
    );
    vi.mocked(agentApi.listSessions).mockResolvedValue(sessions);
    renderDashboard('/');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Agent 1' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    await screen.findByRole('checkbox', { name: 'Select Agent 11' });
    expect(screen.queryByRole('group', { name: 'Agent selection' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Agent 11' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop Selected' }));
    await waitFor(() => {
      expect(agentApi.stopSession).toHaveBeenCalledTimes(1);
      expect(agentApi.stopSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'agent-10');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(screen.getByRole('checkbox', { name: 'Select Agent 1' })).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'Agent selection' })).not.toBeInTheDocument();
  });

  it('removes vanished agents from bulk selection after a server refresh', async () => {
    const sessions = [makeSession({ name: 'Removed agent' }), makeSession({ name: 'Kept agent' })];
    vi.mocked(agentApi.listSessions).mockResolvedValue(sessions);
    const { queryClient } = renderDashboard('/');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Removed agent' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Kept agent' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    vi.mocked(agentApi.listSessions).mockResolvedValue([sessions[1]]);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    });
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Kept agent' })).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'Select Removed agent' })
    ).not.toBeInTheDocument();
  });

  it('shows a retry state instead of zero metrics or an empty fleet when the first load fails', async () => {
    vi.mocked(agentApi.listSessions).mockRejectedValueOnce(new Error('Service unavailable'));
    renderDashboard('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load agents');
    expect(screen.queryByText('Launch your first agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Fleet Overview')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Total Loops:/ })).not.toBeInTheDocument();

    let completeRetry!: (sessions: ReturnType<typeof makeSession>[]) => void;
    vi.mocked(agentApi.listSessions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeRetry = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Retrying…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeDisabled();
    await act(async () => completeRetry([makeSession({ name: 'Recovered agent' })]));
    expect(
      await screen.findByRole('checkbox', { name: 'Select Recovered agent' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps last-known agents visible with a warning after a refresh failure and clears it on recovery', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([makeSession({ name: 'Saved agent' })]);
    renderDashboard('/');
    await screen.findByRole('checkbox', { name: 'Select Saved agent' });
    vi.mocked(agentApi.listSessions).mockRejectedValueOnce(new Error('Network error'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh agents');
    expect(screen.getByRole('alert')).toHaveTextContent('Statuses and metrics may be out of date');
    expect(screen.getByRole('checkbox', { name: 'Select Saved agent' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Total Loops:/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows the genuine empty state after a successful empty response', async () => {
    renderDashboard('/');
    expect(await screen.findByText('Launch your first agent')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
  });

  it('does not show another workspace’s agents when the new workspace fails to load', async () => {
    vi.mocked(agentApi.listSessions).mockResolvedValue([
      makeSession({ name: 'Other workspace agent' }),
    ]);
    renderDashboard('/');
    await screen.findByRole('checkbox', { name: 'Select Other workspace agent' });
    vi.mocked(agentApi.listSessions).mockRejectedValue(new Error('Unavailable'));
    act(() =>
      useAuthStore.setState({
        currentBrand: { ...useAuthStore.getState().currentBrand!, id: 'brand-2' },
      })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load agents');
    expect(
      screen.queryByRole('checkbox', { name: 'Select Other workspace agent' })
    ).not.toBeInTheDocument();
  });

  it('explains missing offline data without claiming the fleet is empty', async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    renderDashboard('/');
    expect(await screen.findByText('Agent data unavailable offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.queryByText('Launch your first agent')).not.toBeInTheDocument();
    expect(agentApi.listSessions).not.toHaveBeenCalled();
  });

  it('labels offline cached data as saved and prevents refresh until connected', async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    const { queryClient } = renderDashboard('/');
    act(() =>
      queryClient.setQueryData(queryKeys.sessions.list('tenant-1', 'brand-1'), [
        makeSession({ name: 'Cached agent' }),
      ])
    );
    expect(await screen.findByText('Viewing saved agents')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Cached agent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeDisabled();
  });
});
