/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, mockElectronAPI, screen, fireEvent, waitFor } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import { useAuditLogStore } from '../stores/auditLog';
import AuditLog from './AuditLog';

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
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

const MOCK_ENTRIES = [
  {
    id: 'audit-1',
    action: 'agent.created' as const,
    description: 'Created agent "Support Bot"',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'audit-2',
    action: 'agent.started' as const,
    description: 'Started agent "Support Bot"',
    timestamp: Date.now() - 30000,
  },
  {
    id: 'audit-3',
    action: 'user.login' as const,
    description: 'User logged in',
    timestamp: Date.now() - 10000,
  },
  {
    id: 'audit-4',
    action: 'config.changed' as const,
    description: 'Changed model to claude-sonnet-4-6',
    timestamp: Date.now() - 5000,
  },
];

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
    useAuthStore.setState(AUTH_STATE);
    useAuditLogStore.setState({
      entries: MOCK_ENTRIES,
      isLoaded: true,
    });
  });

  it('renders entries from store', () => {
    renderWithProviders(<AuditLog />);

    expect(screen.getByText('Created agent "Support Bot"')).toBeTruthy();
    expect(screen.getByText('Started agent "Support Bot"')).toBeTruthy();
    expect(screen.getByText('User logged in')).toBeTruthy();
    expect(screen.getByText('Changed model to claude-sonnet-4-6')).toBeTruthy();
  });

  it('renders page header', () => {
    renderWithProviders(<AuditLog />);

    expect(screen.getByText('Audit Log')).toBeTruthy();
    expect(screen.getByText('Track all actions performed in the application')).toBeTruthy();
  });

  it('filters entries by action type', () => {
    renderWithProviders(<AuditLog />);

    const filterSelect = screen.getByDisplayValue('All Actions');
    fireEvent.change(filterSelect, { target: { value: 'agent.created' } });

    expect(screen.getByText('Created agent "Support Bot"')).toBeTruthy();
    expect(screen.queryByText('Started agent "Support Bot"')).toBeNull();
    expect(screen.queryByText('User logged in')).toBeNull();
  });

  it('filters entries by search query', () => {
    renderWithProviders(<AuditLog />);

    const searchInput = screen.getByPlaceholderText('Search audit log...');
    fireEvent.change(searchInput, { target: { value: 'Support Bot' } });

    expect(screen.getByText('Created agent "Support Bot"')).toBeTruthy();
    expect(screen.getByText('Started agent "Support Bot"')).toBeTruthy();
    expect(screen.queryByText('User logged in')).toBeNull();
    expect(screen.queryByText('Changed model to claude-sonnet-4-6')).toBeNull();
  });

  it('shows empty state when no entries exist', () => {
    useAuditLogStore.setState({ entries: [], isLoaded: true });

    renderWithProviders(<AuditLog />);

    expect(screen.getByText('No audit log entries yet')).toBeTruthy();
  });

  it('shows empty state when filters match nothing', () => {
    renderWithProviders(<AuditLog />);

    const searchInput = screen.getByPlaceholderText('Search audit log...');
    fireEvent.change(searchInput, { target: { value: 'zzz-nonexistent' } });

    expect(screen.getByText('No entries match your filters')).toBeTruthy();
  });

  it('shows Clear All button when entries exist', () => {
    renderWithProviders(<AuditLog />);

    expect(screen.getByText('Clear All')).toBeTruthy();
  });

  it('does not show Clear All button when no entries', () => {
    useAuditLogStore.setState({ entries: [], isLoaded: true });

    renderWithProviders(<AuditLog />);

    expect(screen.queryByText('Clear All')).toBeNull();
  });

  it('shows confirmation dialog when Clear All is clicked', async () => {
    renderWithProviders(<AuditLog />);

    const clearButton = screen.getByText('Clear All');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.getByText('Clear Audit Log')).toBeTruthy();
    });

    expect(screen.getByText(/This will permanently delete all/)).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
