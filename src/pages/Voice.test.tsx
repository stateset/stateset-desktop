/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';

// --- Mocks ---

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      tenant: { id: 'tenant-1', name: 'Test' },
      currentBrand: { id: 'brand-1', name: 'Brand' },
    };
    return selector ? selector(state) : state;
  },
}));

const connect = vi.fn();
const disconnect = vi.fn();
const clearEvents = vi.fn();

vi.mock('../hooks/useAgentStream', () => ({
  useAgentStream: () => ({
    isConnected: false,
    isConnecting: false,
    error: null,
    events: [],
    messages: [],
    status: null,
    metrics: null,
    isTyping: false,
    connect,
    disconnect,
    clearEvents,
  }),
}));

vi.mock('../lib/api', () => ({
  agentApi: {
    createSession: vi.fn(),
    startSession: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...filterDomProps(props)}>{children}</span>
    ),
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...filterDomProps(props)}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, ...rest } = props;
  return rest;
}

const loadVoice = async () => {
  const mod = await import('./Voice');
  return mod.default;
};

describe('Voice page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockElectronAPI();
  });

  it('renders the header with an offline status', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    expect(screen.getByRole('heading', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows the API key empty state and quick action prompts', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    expect(screen.getByText('ElevenLabs API key required')).toBeInTheDocument();
    // Default focus is support, which surfaces three quick prompts
    expect(screen.getByRole('button', { name: /Where is my order #1001/ })).toBeInTheDocument();
  });

  it('disables the mic button until an API key is provided', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeDisabled();
  });

  it('toggles the settings panel from the header', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    expect(screen.queryByRole('region', { name: 'Voice settings' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Toggle settings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Voice settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('ElevenLabs API Key')).toBeInTheDocument();
  });

  it('enables the mic button once an API key is entered', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle settings' }));
    fireEvent.change(screen.getByLabelText('ElevenLabs API Key'), {
      target: { value: 'xi-key' },
    });

    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeEnabled();
    expect(screen.queryByText('ElevenLabs API key required')).not.toBeInTheDocument();
  });

  it('opens settings from the empty state call to action', async () => {
    const Voice = await loadVoice();
    renderWithProviders(<Voice />);

    fireEvent.click(screen.getByRole('button', { name: /Open Settings/ }));
    expect(screen.getByRole('region', { name: 'Voice settings' })).toBeInTheDocument();
  });
});
