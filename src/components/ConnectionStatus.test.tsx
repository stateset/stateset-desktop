/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionDot, type ConnectionState } from './ConnectionStatus';

describe('ConnectionStatus', () => {
  const labelByState: Record<ConnectionState, string> = {
    connected: 'Connected',
    connecting: 'Connecting',
    disconnected: 'Disconnected',
    error: 'Connection Error',
    reconnecting: 'Reconnecting',
  };

  it.each(Object.entries(labelByState))('renders the %s state label', (state, label) => {
    render(<ConnectionStatus state={state as ConnectionState} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('is announced politely as a live region', () => {
    render(<ConnectionStatus state="connected" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a custom message instead of the default label', () => {
    render(<ConnectionStatus state="error" message="Lost connection to agent" />);
    expect(screen.getByRole('status')).toHaveTextContent('Lost connection to agent');
    expect(screen.queryByText('Connection Error')).not.toBeInTheDocument();
  });

  it('shows reconnect attempt progress', () => {
    render(<ConnectionStatus state="reconnecting" reconnectAttempt={2} maxReconnectAttempts={5} />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting (2/5)');
  });

  it('shows reconnecting ellipsis without a max attempt count', () => {
    render(<ConnectionStatus state="reconnecting" reconnectAttempt={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...');
  });

  it('renders the compact variant as a status region', () => {
    render(<ConnectionStatus state="connected" compact />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Connected');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('applies a custom className', () => {
    render(<ConnectionStatus state="connected" compact className="my-class" />);
    expect(screen.getByRole('status').className).toContain('my-class');
  });
});

describe('ConnectionDot', () => {
  it('exposes the connection state via aria-label', () => {
    render(<ConnectionDot state="error" />);
    expect(screen.getByRole('status', { name: 'Connection Error' })).toBeInTheDocument();
  });

  it('labels the connected state', () => {
    render(<ConnectionDot state="connected" />);
    expect(screen.getByRole('status', { name: 'Connected' })).toBeInTheDocument();
  });

  it('applies size classes', () => {
    render(<ConnectionDot state="connected" size="lg" />);
    expect(screen.getByRole('status').className).toContain('h-3');
  });
});
