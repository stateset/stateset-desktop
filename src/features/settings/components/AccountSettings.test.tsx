/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import { useAuthStore } from '../../../stores/auth';
import { AccountSettings } from './AccountSettings';
import type { Tenant } from '../../../types';

const TENANT: Tenant = {
  id: 'tenant-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  tier: 'pro',
  created_at: '2024-01-01T00:00:00Z',
};

function mockClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  });
  return writeText;
}

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      tenant: TENANT,
      apiKey: 'sk-test-1234567890abcd',
    });
  });

  it('renders organization name and capitalized plan tier', () => {
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('renders enterprise tier capitalized', () => {
    useAuthStore.setState({ tenant: { ...TENANT, tier: 'enterprise' } });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('shows fallbacks when tenant is missing', () => {
    useAuthStore.setState({ tenant: null });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    // Plan badge must not render the literal string "undefined"
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('masks long API keys', () => {
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('sk-tes...abcd')).toBeInTheDocument();
    expect(screen.queryByText('sk-test-1234567890abcd')).not.toBeInTheDocument();
  });

  it('shows short API keys unmasked', () => {
    useAuthStore.setState({ apiKey: 'sk-short' });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('sk-short')).toBeInTheDocument();
  });

  it('shows "Not set" when there is no API key', () => {
    useAuthStore.setState({ apiKey: null });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('copies the full API key to the clipboard and shows copied state', async () => {
    const writeText = mockClipboard();
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    const copyButton = screen.getByRole('button', { name: 'Copy API key' });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('sk-test-1234567890abcd');
    await waitFor(() => {
      expect(copyButton.className).toContain('bg-green-900/30');
    });
  });

  it('does not copy when no API key is set', () => {
    const writeText = mockClipboard();
    useAuthStore.setState({ apiKey: null });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }));

    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not crash when clipboard API is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }))
    ).not.toThrow();
  });

  it('shows a warning when secure storage is unavailable', () => {
    renderWithProviders(<AccountSettings secureStorageAvailable={false} />);

    expect(screen.getByText(/Secure storage is unavailable/)).toBeInTheDocument();
  });

  it('hides the warning when secure storage is available', () => {
    renderWithProviders(<AccountSettings secureStorageAvailable={true} />);

    expect(screen.queryByText(/Secure storage is unavailable/)).not.toBeInTheDocument();
  });
});
