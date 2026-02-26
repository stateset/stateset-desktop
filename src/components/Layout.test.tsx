/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
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

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: PropsWithChildren<{ className?: string }>) => (
      <div className={className}>{children}</div>
    ),
    main: ({ children, className }: PropsWithChildren<{ className?: string }>) => (
      <main className={className}>{children}</main>
    ),
  },
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
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

  it('renders disabled brands as non-interactive options', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /select brand/i }));

    const disabledOption = screen.getByRole('option', { name: /disabled brand/i });
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
