/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, mockElectronAPI, screen, fireEvent } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import Templates from './Templates';
import type { AgentTemplate } from '../types';

const mockInitialize = vi.fn();
const mockGetAllTemplates = vi.fn();
const mockRemoveCustomTemplate = vi.fn();

vi.mock('../stores/templates', () => ({
  useTemplatesStore: vi.fn(() => ({
    initialize: mockInitialize,
    getAllTemplates: mockGetAllTemplates,
    removeCustomTemplate: mockRemoveCustomTemplate,
  })),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../features/templates/components/TemplateDetailPanel', () => ({
  TemplateDetailPanel: ({ template }: { template: { name: string } }) => (
    <div data-testid="template-detail-panel">{template.name}</div>
  ),
}));

vi.mock('../features/templates/components/SaveAsTemplateDialog', () => ({
  SaveAsTemplateDialog: () => <div data-testid="save-template-dialog">SaveAsTemplateDialog</div>,
}));

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

const MOCK_TEMPLATES: AgentTemplate[] = [
  {
    id: 'interactive',
    name: 'Interactive Assistant',
    description: 'A conversational agent for direct chat interactions',
    icon: 'MessageSquare',
    color: 'bg-brand-600',
    category: 'general',
    agentType: 'interactive',
    config: {
      mcp_servers: [],
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: false,
    },
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handles customer inquiries and support tickets',
    icon: 'HelpCircle',
    color: 'bg-purple-600',
    category: 'support',
    agentType: 'interactive',
    config: {
      mcp_servers: ['gorgias'],
      model: 'claude-sonnet-4-6',
      temperature: 0.5,
      loop_interval_ms: 2000,
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: true,
    },
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Agent',
    description: 'Manages orders, products, and fulfillment',
    icon: 'ShoppingCart',
    color: 'bg-green-600',
    category: 'commerce',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify'],
      model: 'claude-sonnet-4-6',
      temperature: 0.3,
      loop_interval_ms: 2000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: true,
    },
  },
];

describe('Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    useAuthStore.setState(AUTH_STATE);
    mockGetAllTemplates.mockReturnValue(MOCK_TEMPLATES);
  });

  it('renders template cards from store', () => {
    renderWithProviders(<Templates />);

    expect(screen.getByText('Interactive Assistant')).toBeTruthy();
    expect(screen.getByText('Customer Support')).toBeTruthy();
    expect(screen.getByText('E-commerce Agent')).toBeTruthy();
  });

  it('calls initialize on mount', () => {
    renderWithProviders(<Templates />);

    expect(mockInitialize).toHaveBeenCalled();
  });

  it('renders page header and search input', () => {
    renderWithProviders(<Templates />);

    expect(screen.getByText('Templates')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search templates...')).toBeTruthy();
  });

  it('filters templates by search query', () => {
    renderWithProviders(<Templates />);

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'Customer' } });

    expect(screen.getByText('Customer Support')).toBeTruthy();
    expect(screen.queryByText('Interactive Assistant')).toBeNull();
    expect(screen.queryByText('E-commerce Agent')).toBeNull();
  });

  it('filters templates by category tab', () => {
    renderWithProviders(<Templates />);

    const supportTab = screen.getByText('Support');
    fireEvent.click(supportTab);

    expect(screen.getByText('Customer Support')).toBeTruthy();
    expect(screen.queryByText('Interactive Assistant')).toBeNull();
    expect(screen.queryByText('E-commerce Agent')).toBeNull();
  });

  it('shows empty state when no templates match search', () => {
    renderWithProviders(<Templates />);

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'zzz-nonexistent' } });

    expect(screen.getByText('No templates match "zzz-nonexistent"')).toBeTruthy();
  });

  it('shows empty state when no templates in category', () => {
    renderWithProviders(<Templates />);

    // "My Templates" tab = custom category; no custom templates in our mock data
    const customTab = screen.getByText('My Templates');
    fireEvent.click(customTab);

    expect(screen.getByText('No templates in this category')).toBeTruthy();
  });

  it('renders Create Template button', () => {
    renderWithProviders(<Templates />);

    expect(screen.getByText('Create Template')).toBeTruthy();
  });
});
