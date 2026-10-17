/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import type { Platform } from '../features/connections/platforms';
import { hasMissingRequiredFields } from '../features/connections/utils';

// --- Mocks ---

const mockUseConnections = vi.fn();
const mockUseConnectionMutations = vi.fn();

vi.mock('../features/connections/hooks/useConnections', () => ({
  useConnections: () => mockUseConnections(),
}));

vi.mock('../features/connections/hooks/useConnectionMutations', () => ({
  useConnectionMutations: () => mockUseConnectionMutations(),
}));

const mockVerifyAll = vi.fn();

vi.mock('../features/connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => [
    {
      id: 'stateset-sync',
      name: 'StateSet Sync',
      connected: true,
      isLocalOnly: false,
      isMcpServer: true,
      toolCount: 2,
      tools: ['list_orders', 'get_order'],
      verifiedAt: new Date().toISOString(),
    },
  ],
  useMcpServerOptionsState: () => ({
    options: [
      {
        id: 'stateset-sync',
        name: 'StateSet Sync',
        connected: true,
        isLocalOnly: false,
        isMcpServer: true,
        toolCount: 2,
        tools: ['list_orders', 'get_order'],
        verifiedAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('../features/connections/hooks/useVerifyAllMcpServers', () => ({
  useVerifyAllMcpServers: () => ({ verifyAll: mockVerifyAll, isVerifying: false }),
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
  PlatformCard: ({
    platform,
    formExtra,
    onCredentialChange,
    onSaveCredentials,
    onTest,
    onDisconnect,
    verification,
  }: {
    platform: Platform;
    formExtra?: React.ReactNode;
    onCredentialChange: (key: string, value: string) => void;
    onSaveCredentials: () => void;
    onTest: () => void;
    onDisconnect: () => void;
    verification?: unknown;
  }) => (
    <div data-testid={`platform-card-${platform.id}`}>
      <span>{platform.name}</span>
      {formExtra}
      <button type="button" onClick={() => onCredentialChange('auth_token', 'sk_test')}>
        fill-{platform.id}
      </button>
      <button type="button" onClick={onSaveCredentials}>
        save-{platform.id}
      </button>
      <button type="button" onClick={onTest}>
        test-{platform.id}
      </button>
      <button type="button" onClick={onDisconnect}>
        disconnect-{platform.id}
      </button>
      {verification ? <span data-testid={`verified-${platform.id}`} /> : null}
    </div>
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

  describe('StateSet MCP servers', () => {
    it('renders a card for every StateSet MCP server', async () => {
      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      expect(screen.getByRole('heading', { name: 'StateSet MCP servers' })).toBeInTheDocument();
      for (const id of ['stateset-response', 'stateset-engine', 'stateset-sync']) {
        expect(screen.getByTestId(`platform-card-${id}`)).toBeInTheDocument();
      }
      for (const name of ['StateSet NSR', 'StateSet Commerce', 'StateSet Voice', 'StateSet EDI']) {
        expect(screen.getByRole('heading', { name })).toBeInTheDocument();
      }
    });

    it('hides the StateSet cards while connections load', async () => {
      mockUseConnections.mockReturnValue({ ...defaultConnectionState, isLoading: true });

      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      expect(screen.getByRole('heading', { name: 'StateSet MCP servers' })).toBeInTheDocument();
      expect(screen.queryByTestId('platform-card-stateset-response')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'StateSet NSR' })).not.toBeInTheDocument();
    });

    it('stores the server endpoint with the api key on save', async () => {
      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      fireEvent.click(screen.getByText('fill-stateset-response'));
      fireEvent.click(screen.getByText('save-stateset-response'));

      await waitFor(() =>
        expect(defaultMutations.storeCredentials.mutateAsync).toHaveBeenCalledWith({
          platform: 'stateset-response',
          creds: {
            endpoint: 'https://response.stateset.com/api/mcp',
            auth_token: 'sk_test',
          },
        })
      );
    });

    it('does not save when required fields are missing', async () => {
      vi.mocked(hasMissingRequiredFields).mockReturnValueOnce(true);
      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      fireEvent.click(screen.getByText('save-stateset-engine'));

      expect(
        await screen.findByText('Please fill out all StateSet Engine credentials before saving.')
      ).toBeInTheDocument();
      expect(defaultMutations.storeCredentials.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it('offers a live server test on hosted StateSet cards only', async () => {
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      displayedPlatforms: [makePlatform()],
    });
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    const statesetCard = screen.getByTestId('platform-card-stateset-response');
    expect(within(statesetCard).getByRole('button', { name: 'Test server' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('platform-card-shopify')).queryByRole('button', {
        name: 'Test server',
      })
    ).not.toBeInTheDocument();
  });

  it('tests a connection locally when the vault is unavailable', async () => {
    defaultMutations.testConnection.mutateAsync.mockResolvedValue({
      success: true,
      message: 'stateset-sync 2.1.0 · 3 tools',
    });
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      isLocalMode: true,
      displayedPlatforms: [makePlatform()],
    });
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    fireEvent.click(screen.getByText('test-shopify'));

    await waitFor(() =>
      expect(defaultMutations.testConnection.mutateAsync).toHaveBeenCalledWith('shopify')
    );
    expect(await screen.findByText('stateset-sync 2.1.0 · 3 tools')).toBeInTheDocument();
  });

  describe('testing every local server at once', () => {
    it('is offered only when credentials are stored locally', async () => {
      const Connections = await loadConnections();
      const { unmount } = renderWithProviders(<Connections />);
      expect(screen.queryByRole('button', { name: 'Test all servers' })).not.toBeInTheDocument();
      unmount();

      mockUseConnections.mockReturnValue({ ...defaultConnectionState, isLocalMode: true });
      renderWithProviders(<Connections />);
      expect(screen.getByRole('button', { name: 'Test all servers' })).toBeInTheDocument();
    });

    it('summarises the results', async () => {
      mockVerifyAll.mockResolvedValue({ verified: 2, failed: 1, total: 3 });
      mockUseConnections.mockReturnValue({ ...defaultConnectionState, isLocalMode: true });
      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      fireEvent.click(screen.getByRole('button', { name: 'Test all servers' }));

      expect(await screen.findByText('2 of 3 responded, 1 failed.')).toBeInTheDocument();
    });

    it('says when there is nothing stored to test', async () => {
      mockVerifyAll.mockResolvedValue({ verified: 0, failed: 0, total: 0 });
      mockUseConnections.mockReturnValue({ ...defaultConnectionState, isLocalMode: true });
      const Connections = await loadConnections();
      renderWithProviders(<Connections />);

      fireEvent.click(screen.getByRole('button', { name: 'Test all servers' }));

      expect(
        await screen.findByText('No MCP servers are stored on this device.')
      ).toBeInTheDocument();
    });
  });

  it('hides a stored verification once the server is disconnected', async () => {
    mockUseConnections.mockReturnValue({
      ...defaultConnectionState,
      displayedPlatforms: [makePlatform()],
      isConnected: () => false,
    });
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    expect(screen.queryByTestId('verified-shopify')).not.toBeInTheDocument();
  });

  it('offers the tool catalog for connected MCP servers', async () => {
    const Connections = await loadConnections();
    renderWithProviders(<Connections />);

    const toggle = screen.getByRole('button', { name: /Tool catalog/ });
    expect(toggle).toHaveTextContent('2 tools');

    fireEvent.click(toggle);
    expect(screen.getByText('list_orders')).toBeInTheDocument();
  });
});
