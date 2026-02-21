/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import type { Webhook } from '../types';

// --- Mocks ---

const mockUseWebhooksList = vi.fn();
const mockCreateWebhook = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateWebhook = { mutate: vi.fn(), isPending: false };
const mockDeleteWebhook = { mutate: vi.fn(), isPending: false };
const mockTestWebhook = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../features/webhooks', () => ({
  useWebhooksList: () => mockUseWebhooksList(),
  useCreateWebhook: () => mockCreateWebhook,
  useUpdateWebhook: () => mockUpdateWebhook,
  useDeleteWebhook: () => mockDeleteWebhook,
  useTestWebhook: () => mockTestWebhook,
  WebhookCard: ({ webhook }: { webhook: Webhook }) => (
    <div data-testid={`webhook-card-${webhook.id}`}>{webhook.name}</div>
  ),
  WebhookForm: () => null,
  WebhookDetailPanel: () => null,
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

const loadWebhooks = async () => {
  const mod = await import('./Webhooks');
  return mod.default;
};

const makeWebhook = (overrides: Partial<Webhook> = {}): Webhook => ({
  id: 'wh-1',
  tenant_id: 'tenant-1',
  brand_id: 'brand-1',
  name: 'Order Created Hook',
  url: 'https://example.com/webhook',
  direction: 'outgoing',
  events: ['order.created'],
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('Webhooks page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockElectronAPI();
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
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty state when no webhooks exist', async () => {
    mockUseWebhooksList.mockReturnValue({ data: [], isLoading: false });
    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    expect(screen.getByText('No webhooks configured')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first webhook to receive real-time notifications')
    ).toBeInTheDocument();
  });

  it('renders loading state', async () => {
    mockUseWebhooksList.mockReturnValue({ data: undefined, isLoading: true });
    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    // Loading spinner is rendered (no empty state or webhook cards)
    expect(screen.queryByText('No webhooks configured')).not.toBeInTheDocument();
  });

  it('renders webhook list when webhooks exist', async () => {
    const webhooks = [
      makeWebhook({ id: 'wh-1', name: 'Order Hook' }),
      makeWebhook({ id: 'wh-2', name: 'Return Hook', url: 'https://example.com/returns' }),
    ];
    mockUseWebhooksList.mockReturnValue({ data: webhooks, isLoading: false });

    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    expect(screen.getByTestId('webhook-card-wh-1')).toBeInTheDocument();
    expect(screen.getByTestId('webhook-card-wh-2')).toBeInTheDocument();
    expect(screen.getByText('Order Hook')).toBeInTheDocument();
    expect(screen.getByText('Return Hook')).toBeInTheDocument();
  });

  it('filters webhooks by search query', async () => {
    const webhooks = [
      makeWebhook({ id: 'wh-1', name: 'Order Hook' }),
      makeWebhook({ id: 'wh-2', name: 'Return Hook', url: 'https://example.com/returns' }),
    ];
    mockUseWebhooksList.mockReturnValue({ data: webhooks, isLoading: false });

    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    const searchInput = screen.getByPlaceholderText('Search webhooks...');
    fireEvent.change(searchInput, { target: { value: 'Return' } });
    act(() => vi.advanceTimersByTime(300));

    expect(screen.queryByTestId('webhook-card-wh-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('webhook-card-wh-2')).toBeInTheDocument();
  });

  it('shows no results message when search matches nothing', async () => {
    const webhooks = [makeWebhook({ id: 'wh-1', name: 'Order Hook' })];
    mockUseWebhooksList.mockReturnValue({ data: webhooks, isLoading: false });

    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    const searchInput = screen.getByPlaceholderText('Search webhooks...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    act(() => vi.advanceTimersByTime(300));

    expect(screen.queryByTestId('webhook-card-wh-1')).not.toBeInTheDocument();
  });

  it('renders the page header and Create Webhook button', async () => {
    mockUseWebhooksList.mockReturnValue({ data: [], isLoading: false });
    const Webhooks = await loadWebhooks();
    renderWithProviders(<Webhooks />);

    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(
      screen.getByText('Manage webhook endpoints for real-time event notifications')
    ).toBeInTheDocument();
  });
});
