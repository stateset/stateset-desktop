/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, mockElectronAPI, screen, waitFor } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import Analytics from './Analytics';

vi.mock('../lib/api', () => ({
  agentApi: {
    listSessions: vi.fn(async () => []),
  },
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../components/DateRangePicker', () => ({
  DateRangePicker: () => <div data-testid="date-range-picker">DateRangePicker</div>,
}));

vi.mock('../components/AnalyticsChart', () => ({
  StatCard: ({ label, value }: { label: string; value: number }) => (
    <div data-testid={`stat-${label}`}>
      <span>{label}</span>
      <span data-testid={`stat-value-${label}`}>{value}</span>
    </div>
  ),
  LineChart: () => <div data-testid="line-chart">LineChart</div>,
  BarChart: () => <div data-testid="bar-chart">BarChart</div>,
  DonutChart: () => <div data-testid="donut-chart">DonutChart</div>,
}));

const { agentApi } = await import('../lib/api');

const AUTH_STATE = {
  isAuthenticated: true,
  isLoading: false,
  apiKey: 'sk-test',
  sandboxApiKey: null,
  tenant: {
    id: 'tenant-1',
    name: 'Test Tenant',
    slug: 'test-tenant',
    tier: 'pro' as const,
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
};

function makeMockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'interactive',
    name: 'Test Session',
    tags: [],
    status: 'running',
    config: {
      mcp_servers: [],
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: false,
    },
    metrics: {
      loop_count: 5,
      tokens_used: 1200,
      tool_calls: 8,
      errors: 0,
      messages_sent: 10,
      uptime_seconds: 300,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    useAuthStore.setState(AUTH_STATE);
  });

  it('renders loading skeleton cards when data is loading', () => {
    // Make listSessions hang so we stay in loading state
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<Analytics />);

    // The loading state renders 8 SkeletonCard components (4 + 4)
    const skeletons = document.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders stat cards when sessions load', async () => {
    const sessions = [
      makeMockSession({
        id: 'session-1',
        status: 'running',
        metrics: {
          loop_count: 5,
          tokens_used: 1200,
          tool_calls: 8,
          errors: 0,
          messages_sent: 10,
          uptime_seconds: 300,
        },
      }),
      makeMockSession({
        id: 'session-2',
        status: 'stopped',
        agent_type: 'customer-support',
        metrics: {
          loop_count: 3,
          tokens_used: 800,
          tool_calls: 4,
          errors: 1,
          messages_sent: 6,
          uptime_seconds: 120,
        },
      }),
    ];
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-Total Agents')).toBeTruthy();
    });

    expect(screen.getByTestId('stat-value-Total Agents').textContent).toBe('2');
    expect(screen.getByTestId('stat-value-Running Now').textContent).toBe('1');
    expect(screen.getByTestId('stat-value-Total Tokens').textContent).toBe('2000');
    expect(screen.getByTestId('stat-value-Tool Calls').textContent).toBe('12');
  });

  it('renders the page title and header text', async () => {
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByText('Analytics')).toBeTruthy();
    });

    expect(screen.getByText('Monitor your agent performance and usage metrics')).toBeTruthy();
  });

  it('renders charts when sessions are loaded', async () => {
    const sessions = [makeMockSession()];
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeTruthy();
    });

    expect(screen.getAllByTestId('bar-chart')).toHaveLength(2);
    expect(screen.getByTestId('donut-chart')).toBeTruthy();
  });

  it('shows empty state when no sessions exist', async () => {
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-Total Agents')).toBeTruthy();
    });

    // All stat values should be 0
    expect(screen.getByTestId('stat-value-Total Agents').textContent).toBe('0');
    expect(screen.getByTestId('stat-value-Running Now').textContent).toBe('0');
    expect(screen.getByTestId('stat-value-Total Tokens').textContent).toBe('0');
    expect(screen.getByTestId('stat-value-Tool Calls').textContent).toBe('0');
  });

  it('renders the date range picker', async () => {
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByTestId('date-range-picker')).toBeTruthy();
    });
  });

  it('renders summary table with agent types when sessions exist', async () => {
    const sessions = [
      makeMockSession({ id: 'session-1', agent_type: 'interactive' }),
      makeMockSession({ id: 'session-2', agent_type: 'customer-support' }),
    ];
    (agentApi.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    renderWithProviders(<Analytics />);

    await waitFor(() => {
      expect(screen.getByText('Agent Performance Summary')).toBeTruthy();
    });

    expect(screen.getByText('Interactive')).toBeTruthy();
    expect(screen.getByText('Customer-support')).toBeTruthy();
  });
});
