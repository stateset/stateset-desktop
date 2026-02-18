/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

// Settings.tsx uses NAMED imports, not default exports
vi.mock('../features/settings/components/AccountSettings', () => ({
  AccountSettings: () => <div data-testid="account-settings">AccountSettings</div>,
}));
vi.mock('../features/settings/components/SandboxSettings', () => ({
  SandboxSettings: () => <div data-testid="sandbox-settings">SandboxSettings</div>,
}));
vi.mock('../features/settings/components/BackgroundSettings', () => ({
  BackgroundSettings: () => <div data-testid="background-settings">BackgroundSettings</div>,
}));
vi.mock('../features/settings/components/AppearanceSettings', () => ({
  AppearanceSettings: () => <div data-testid="appearance-settings">AppearanceSettings</div>,
}));
vi.mock('../features/settings/components/NotificationSettings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings">NotificationSettings</div>,
}));
vi.mock('../features/settings/components/UpdateSettings', () => ({
  UpdateSettings: () => <div data-testid="update-settings">UpdateSettings</div>,
}));
vi.mock('../features/settings/components/AboutSettings', () => ({
  AboutSettings: () => <div data-testid="about-settings">AboutSettings</div>,
}));

const loadSettings = async () => {
  const mod = await import('./Settings');
  return mod.default;
};

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
  });

  it('renders the Settings heading', async () => {
    const Settings = await loadSettings();
    renderWithProviders(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders all settings sections', async () => {
    const Settings = await loadSettings();
    renderWithProviders(<Settings />);

    expect(screen.getByTestId('account-settings')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-settings')).toBeInTheDocument();
    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    expect(screen.getByTestId('about-settings')).toBeInTheDocument();
  });
});
