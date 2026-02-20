/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import type { Platform } from '../features/connections/platforms';

// --- Mocks ---

const mockUseConnections = vi.fn();
const mockUseConnectionMutations = vi.fn();

vi.mock('../features/connections/hooks/useConnections', () => ({
  useConnections: () => mockUseConnections(),
}));

vi.mock('../features/connections/hooks/useConnectionMutations', () => ({
  useConnectionMutations: () => mockUseConnectionMutations(),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialogComponent: null,
  }),
}));

vi.mock('../features/connections/components/PlatformCard', () => ({
  PlatformCard: ({ platform }: { platform: Platform }) => (
    <div data-testid={`platform-card-${platform.id}`}>{platform.name}</div>
  ),
}));

vi.mock('../features/connections/components/CustomMcpForm', () => ({
  CustomMcpForm: () => <div data-testid="custom-mcp-form" />,
}));

vi.mock('../features/connections/utils', () => ({
  normalizeConnectionInput: vi.fn((_, v: string) => v),
  hasMissingRequiredFields: vi.fn(() => false),
  hasMissingOAuthInput: vi.fn(() => false),
  getPlatformConfig: vi.fn(),
  isBuiltInPlatform: vi.fn(() => true),
}));

const loadConnections = async () => {
  const mod = await import('./Connections');
  return mod.default;
};

const makePlatform = (overrides: Partial<Platform> = {}): Platform => ({
  id: 'shopify',
  name: 'Shopify',
  description: 'E-commerce platform',
  icon: '',
  color: 'bg-green-600',
  requiredFields: [
    { key: 'shop_domain', label: 'Shop Domain', type: 'text' },
    { key: 'access_token', label: 'Access Token', type: 'password' },
  ],
  ...overrides,
});

const defaultMutations = {
  storeCredentials: { mutateAsync: vi.fn(), isPending: false },
  testConnection: { mutateAsync: vi.fn() },
  deleteCredentials: { mutateAsync: vi.fn() },
};

const defaultConnectionState = {
  isLoading: false,
  isLocalMode: false,
  vaultError: null,
  displayedPlatforms: [] as Platform[],
  isConnected: () => false,
  isLocalConnection: () => false,
  handleError: vi.fn(),
};

const authState = {
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

describe('Connections page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    useAuthStore.setState(authState);
    mockUseConnections.mockReturnValue(defaultConnectionState);
    mockUseConnectionMutations.mockReturnValue(defaultMutations);
  });

  it('shows "select a brand" message when no currentBrand is set', async () => {
    useAuthStore.setState({ ...authState, currentBrand: null });

    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByText('Please select a brand first')).toBeInTheDocument();
  });

  it('renders loading spinner while loading', async () => {
    mockUseConnections.mockReturnValue({ ...defaultConnectionState, isLoading: true });

    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    // Header should render, but platforms grid replaced by spinner
    expect(screen.getByText('Platform Connections')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-card-shopify')).not.toBeInTheDocument();
  });

  it('renders platform cards from displayedPlatforms', async () => {
    const platforms = [
      makePlatform({ id: 'shopify', name: 'Shopify' }),
      makePlatform({ id: 'gorgias', name: 'Gorgias', color: 'bg-blue-600' }),
    ];
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      displayedPlatforms: platforms,
    });

    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByTestId('platform-card-shopify')).toBeInTheDocument();
    expect(screen.getByTestId('platform-card-gorgias')).toBeInTheDocument();
    expect(screen.getByText('Shopify')).toBeInTheDocument();
    expect(screen.getByText('Gorgias')).toBeInTheDocument();
  });

  it('shows local mode warning banner when vault is unavailable', async () => {
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      isLocalMode: true,
      vaultError: 'Vault connection refused',
    });

    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByText(/Vault is not configured on the backend/i)).toBeInTheDocument();
    expect(screen.getByText('Vault connection refused')).toBeInTheDocument();
  });

  it('shows vault-connected banner when not in local mode', async () => {
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      isLocalMode: false,
    });

    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByText(/Credentials are securely stored in our vault/i)).toBeInTheDocument();
  });

  it('renders the page header correctly', async () => {
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByText('Platform Connections')).toBeInTheDocument();
    expect(
      screen.getByText('Connect your platforms to enable AI agent access')
    ).toBeInTheDocument();
  });

  it('renders the Add custom MCP server button', async () => {
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.getByText('Add custom MCP server')).toBeInTheDocument();
  });
});
