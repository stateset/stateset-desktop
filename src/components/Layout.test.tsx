/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import Layout from './Layout';
import { renderWithProviders } from '../test-utils';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import type { Brand, Tenant } from '../types';

const mockListSessions = vi.fn();
const mockLog = vi.fn();

vi.mock('../lib/api', () => ({
  agentApi: {
    listSessions: (...args: unknown[]) => mockListSessions(...args),
  },
}));

vi.mock('../hooks/useOfflineCache', () => ({
  useSessionsCache: () => ({
    cacheFromQuery: vi.fn().mockResolvedValue(undefined),
    getCachedSessions: vi.fn().mockResolvedValue([]),
    isOnline: true,
  }),
}));

vi.mock('../stores/auditLog', () => ({
  useAuditLogStore: {
    getState: () => ({ log: mockLog }),
  },
}));

vi.mock('./ApiHealthIndicator', () => ({
  ApiHealthIndicator: () => <div data-testid="api-health-indicator" />,
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
  NotificationsCenter: () => <button type="button">Notifications</button>,
}));

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Tenant One',
  slug: 'tenant-one',
  tier: 'pro',
  created_at: '2026-02-26T00:00:00Z',
};

const enabledBrandOne: Brand = {
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
  ...enabledBrandOne,
  id: 'brand-2',
  slug: 'brand-two',
  name: 'Brand Two',
};

const disabledBrand: Brand = {
  ...enabledBrandOne,
  id: 'brand-3',
  slug: 'brand-three',
  name: 'Disabled Brand',
  enabled: false,
};

function renderLayout() {
  return renderWithProviders(
    <Layout>
      <div>Page Content</div>
    </Layout>
  );
}

describe('Layout brand selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        app: {
          getVersion: vi.fn().mockImplementation(() => new Promise(() => {})),
        },
      },
    });

    useUiStore.setState({
      commandPaletteOpen: false,
      commandPaletteAgents: [],
      sidebarCollapsed: false,
    });

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrandOne,
      brands: [enabledBrandOne, enabledBrandTwo, disabledBrand],
      error: null,
      initAttempts: 0,
    });
  });

  it('switches between enabled brands from the dropdown', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Brand Two' }));

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandTwo.id);
    expect(mockLog).toHaveBeenCalledWith(
      'brand.switched',
      expect.stringContaining('Brand Two'),
      expect.objectContaining({ brandId: enabledBrandTwo.id })
    );
  });

  it('supports keyboard navigation, skips disabled brands and returns focus after switching', () => {
    renderLayout();
    const trigger = screen.getByRole('button', { name: /select brand/i });
    fireEvent.click(trigger);
    const first = screen.getByRole('option', { name: 'Brand One' });
    const second = screen.getByRole('option', { name: 'Brand Two' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
    fireEvent.click(second);
    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandTwo.id);
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Brand Two' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('option', { name: 'Brand Two' }), {
      key: 'Escape',
    });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps brand switching available in the collapsed sidebar', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderLayout();
    const trigger = screen.getByRole('button', { name: /select brand/i });
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    const option = screen.getByRole('option', { name: 'Brand Two' });
    expect(option).toHaveFocus();
    fireEvent.click(option);
    expect(trigger).toHaveAccessibleName('Select brand. Current: Brand Two');
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders disabled brands as non-interactive options', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));

    const disabledOption = screen.getByRole('option', {
      name: /disabled brand/i,
    });
    expect(disabledOption).toBeDisabled();

    fireEvent.click(disabledOption);

    expect(useAuthStore.getState().currentBrand?.id).toBe(enabledBrandOne.id);
    expect(mockLog).not.toHaveBeenCalled();
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);
  });

  it('shows no-active-brand state when tenant has no enabled brands', () => {
    useAuthStore.setState({
      currentBrand: null,
      brands: [disabledBrand],
    });

    renderLayout();

    expect(screen.getByText('No Active Brands')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));
    expect(screen.getByText('No active brands available for agent actions.')).toBeInTheDocument();
  });
});

describe('Layout keyboard shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { app: {} },
    });

    useUiStore.setState({
      commandPaletteOpen: false,
      commandPaletteAgents: [],
      sidebarCollapsed: false,
    });

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrandOne,
      brands: [enabledBrandOne, enabledBrandTwo, disabledBrand],
      error: null,
      initAttempts: 0,
    });
  });

  it('opens the command palette on Ctrl+K', () => {
    renderLayout();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
  });

  it('closes the command palette on Escape', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderLayout();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('ignores Escape while typing in an input when the palette is open', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderLayout();

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    input.remove();

    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
  });

  it('toggles the sidebar on Ctrl+B', () => {
    renderLayout();

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });
});

describe('Layout chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { app: {} },
    });

    useUiStore.setState({
      commandPaletteOpen: false,
      commandPaletteAgents: [],
      sidebarCollapsed: false,
    });

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      apiKey: 'engine-key',
      sandboxApiKey: null,
      tenant,
      currentBrand: enabledBrandOne,
      brands: [enabledBrandOne, enabledBrandTwo, disabledBrand],
      error: null,
      initAttempts: 0,
    });
  });

  it('logs out from the sidebar', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ logout } as never);
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Logout from StateSet' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  function topbarTitle() {
    // The nav also renders route labels, so scope to the topbar title element.
    return document.querySelector('.layout-topbar .layout-page-title')?.textContent;
  }

  it('shows the page title for known, agent, and unknown routes', () => {
    const { unmount } = renderWithProviders(
      <Layout>
        <div>Page Content</div>
      </Layout>,
      { route: '/settings' }
    );
    expect(topbarTitle()).toBe('Settings');
    unmount();

    renderWithProviders(
      <Layout>
        <div>Page Content</div>
      </Layout>,
      { route: '/agent/abc-123' }
    );
    expect(topbarTitle()).toBe('Agent Console');
  });

  it('falls back to the product name for unknown routes', () => {
    renderWithProviders(
      <Layout>
        <div>Page Content</div>
      </Layout>,
      { route: '/no-such-page' }
    );
    expect(topbarTitle()).toBe('StateSet');
  });

  it('closes the brand dropdown on Escape', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));
    expect(screen.getByRole('option', { name: 'Brand Two' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'Brand Two' })).not.toBeInTheDocument();
  });

  it('collapses the sidebar from the toggle button', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.getByRole('button', { name: /select brand/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chats' })).toBeInTheDocument();
  });
});
