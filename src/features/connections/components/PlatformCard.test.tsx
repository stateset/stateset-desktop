/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlatformCard } from './PlatformCard';
import type { Platform } from '../platforms';

const basicPlatform: Platform = {
  id: 'klaviyo',
  name: 'Klaviyo',
  description: 'Email marketing platform',
  icon: 'K',
  color: 'bg-gray-700',
  requiredFields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
};

const oauthPlatform: Platform = {
  id: 'shopify',
  name: 'Shopify',
  description: 'E-commerce platform',
  icon: 'S',
  color: 'bg-green-600',
  requiredFields: [
    { key: 'shop_domain', label: 'Shop Domain', type: 'text' },
    { key: 'access_token', label: 'Access Token', type: 'password' },
  ],
  oauth: {
    provider: 'shopify',
    label: 'Connect with OAuth',
    fields: [
      {
        key: 'shop_domain',
        label: 'Shop Domain',
        type: 'text',
        placeholder: 'mystore.myshopify.com',
      },
    ],
  },
};

function makeProps(overrides: Partial<Parameters<typeof PlatformCard>[0]> = {}) {
  return {
    platform: basicPlatform,
    connected: false,
    isLocal: false,
    isBuiltIn: true,
    isConnecting: false,
    connectMode: null as 'manual' | 'oauth' | null,
    credentials: {},
    oauthInputs: {},
    isStoring: false,
    isTesting: false,
    disableTest: false,
    onCredentialChange: vi.fn(),
    onOauthInputChange: vi.fn(),
    onSaveCredentials: vi.fn(),
    onOAuthConnect: vi.fn(),
    onStartManual: vi.fn(),
    onStartOAuth: vi.fn(),
    onCancel: vi.fn(),
    onTest: vi.fn(),
    onDisconnect: vi.fn(),
    ...overrides,
  };
}

describe('PlatformCard', () => {
  it('renders platform name, icon and description', () => {
    render(<PlatformCard {...makeProps()} />);
    expect(screen.getByText('Klaviyo')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByText('Email marketing platform')).toBeInTheDocument();
  });

  it('shows badges for connected, custom and local platforms', () => {
    render(<PlatformCard {...makeProps({ connected: true, isBuiltIn: false, isLocal: true })} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('hides badges by default', () => {
    render(<PlatformCard {...makeProps()} />);
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
  });

  describe('disconnected state', () => {
    it('starts a manual connection for platforms without OAuth', () => {
      const props = makeProps();
      render(<PlatformCard {...props} />);

      fireEvent.click(screen.getByText('Connect'));
      expect(props.onStartManual).toHaveBeenCalledTimes(1);
      expect(props.onStartOAuth).not.toHaveBeenCalled();
    });

    it('starts OAuth for platforms with OAuth, with a separate manual option', () => {
      const props = makeProps({ platform: oauthPlatform });
      render(<PlatformCard {...props} />);

      fireEvent.click(screen.getByText('Connect with OAuth'));
      expect(props.onStartOAuth).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('Manual'));
      expect(props.onStartManual).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual connection form', () => {
    it('renders required fields and forwards input changes', () => {
      const props = makeProps({ isConnecting: true, connectMode: 'manual' });
      render(<PlatformCard {...props} />);

      expect(screen.getByText('API Key')).toBeInTheDocument();
      const input = screen.getByLabelText('API Key');
      fireEvent.change(input, { target: { value: 'secret' } });
      expect(props.onCredentialChange).toHaveBeenCalledWith('api_key', 'secret');
    });

    it('saves credentials and cancels', () => {
      const props = makeProps({ isConnecting: true, connectMode: 'manual' });
      render(<PlatformCard {...props} />);

      fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));
      expect(props.onSaveCredentials).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('Cancel'));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it('disables save while storing', () => {
      render(
        <PlatformCard
          {...makeProps({ isConnecting: true, connectMode: 'manual', isStoring: true })}
        />
      );
      expect(screen.getByRole('button', { name: 'Save credentials' })).toBeDisabled();
    });
  });

  describe('oauth connection form', () => {
    it('renders oauth fields and forwards input changes', () => {
      const props = makeProps({
        platform: oauthPlatform,
        isConnecting: true,
        connectMode: 'oauth',
      });
      render(<PlatformCard {...props} />);

      const input = screen.getByRole('textbox', { name: 'Shop Domain' });
      fireEvent.change(input, { target: { value: 'shop.myshopify.com' } });
      expect(props.onOauthInputChange).toHaveBeenCalledWith('shop_domain', 'shop.myshopify.com');
    });

    it('triggers the oauth connect callback', () => {
      const props = makeProps({
        platform: oauthPlatform,
        isConnecting: true,
        connectMode: 'oauth',
      });
      render(<PlatformCard {...props} />);

      fireEvent.click(screen.getByRole('button', { name: 'Authenticate with Shopify' }));
      expect(props.onOAuthConnect).toHaveBeenCalledTimes(1);
    });

    it('does not render the oauth form for platforms without oauth config', () => {
      render(<PlatformCard {...makeProps({ isConnecting: true, connectMode: 'oauth' })} />);
      expect(screen.queryByRole('button', { name: /Authenticate/ })).not.toBeInTheDocument();
    });
  });

  describe('connected state', () => {
    it('tests and disconnects the connection', () => {
      const props = makeProps({ connected: true });
      render(<PlatformCard {...props} />);

      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
      expect(props.onTest).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Disconnect Klaviyo' }));
      expect(props.onDisconnect).toHaveBeenCalledTimes(1);
    });

    it('disables the test button when disableTest is set', () => {
      render(<PlatformCard {...makeProps({ connected: true, disableTest: true })} />);

      expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    });

    it('disables disconnect while storing or testing', () => {
      render(<PlatformCard {...makeProps({ connected: true, isTesting: true })} />);
      expect(screen.getByRole('button', { name: 'Disconnect Klaviyo' })).toBeDisabled();
    });
  });

  it('renders formExtra inside the manual credential form only', () => {
    const extra = <span data-testid="probe-slot">probe</span>;
    const { rerender } = render(
      <PlatformCard {...makeProps({ formExtra: extra, isConnecting: false })} />
    );
    expect(screen.queryByTestId('probe-slot')).not.toBeInTheDocument();

    rerender(
      <PlatformCard
        {...makeProps({ formExtra: extra, isConnecting: true, connectMode: 'manual' })}
      />
    );
    expect(screen.getByTestId('probe-slot')).toBeInTheDocument();
  });

  it('shows the last successful verification when there is one', () => {
    const verifiedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { rerender } = render(<PlatformCard {...makeProps()} />);
    expect(screen.queryByText(/verified/)).not.toBeInTheDocument();

    rerender(
      <PlatformCard
        {...makeProps({
          verification: {
            serverName: 'stateset-sync',
            serverVersion: '2.1.0',
            toolCount: 3,
            tools: ['list_orders'],
            verifiedAt,
          },
        })}
      />
    );

    expect(screen.getByText(/3 tools · verified 2h ago/)).toBeInTheDocument();
  });

  it('lists the verified tool names on demand', () => {
    render(
      <PlatformCard
        {...makeProps({
          verification: {
            serverName: 'stateset-sync',
            serverVersion: '2.1.0',
            toolCount: 2,
            tools: ['list_orders', 'get_order'],
            verifiedAt: new Date().toISOString(),
          },
        })}
      />
    );

    expect(screen.queryByText('list_orders')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show tools for Klaviyo' }));

    expect(screen.getByText('list_orders')).toBeInTheDocument();
    expect(screen.getByText('get_order')).toBeInTheDocument();
  });

  it('does not offer a tool list when no names were recorded', () => {
    render(
      <PlatformCard
        {...makeProps({
          verification: {
            serverName: 'legacy',
            serverVersion: '1.0.0',
            toolCount: 4,
            tools: [],
            verifiedAt: new Date().toISOString(),
          },
        })}
      />
    );

    expect(screen.queryByRole('button', { name: /Show tools/ })).not.toBeInTheDocument();
    expect(screen.getByText(/4 tools · verified/)).toBeInTheDocument();
  });

  it('flags a verification older than a week', () => {
    const { rerender } = render(
      <PlatformCard
        {...makeProps({
          verification: {
            serverName: 'sync',
            serverVersion: '2.1.0',
            toolCount: 3,
            tools: [],
            verifiedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          },
        })}
      />
    );
    expect(screen.queryByText(/test again/)).not.toBeInTheDocument();

    rerender(
      <PlatformCard
        {...makeProps({
          verification: {
            serverName: 'sync',
            serverVersion: '2.1.0',
            toolCount: 3,
            tools: [],
            verifiedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          },
        })}
      />
    );
    expect(screen.getByText(/30d ago · test again/)).toBeInTheDocument();
  });
});
