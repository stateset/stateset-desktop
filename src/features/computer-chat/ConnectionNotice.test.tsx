/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionNotice } from './ConnectionNotice';
import { useComputerChatsStore as store } from './store';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { durableChatController } from './durable';
import type { ComputerChat } from './types';
vi.mock('./durable', () => ({
  durableChatController: { refresh: vi.fn().mockResolvedValue(undefined) },
}));
const chat = {
  id: 'chat',
  durableSession: { engineUrl: 'https://engine.example' },
} as ComputerChat;
beforeEach(() => {
  store.setState({
    connections: {
      chat: {
        status: 'reconnecting',
        failures: 2,
        nextRetryAt: Date.now() + 30000,
        message: 'Connection interrupted',
      },
    },
  });
  useDurableWorkflowsStore.setState({ engineUrl: 'https://engine.example' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
describe('conversation connection status', () => {
  it('shows stale observations and retries only a status refresh', async () => {
    render(<ConnectionNotice chat={chat} />);
    expect(screen.getByText('Reconnecting. Showing saved observations.')).toBeInTheDocument();
    expect(screen.getByText(/Retry in/)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Connection interrupted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(durableChatController.refresh).toHaveBeenCalledWith('chat');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry now' })).toBeEnabled());
  });
  it('shows offline state and disables retries until connectivity returns', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<ConnectionNotice chat={chat} />);
    expect(screen.getByText(/You’re offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeDisabled();
  });
  it('explains an engine mismatch without sending a request to another origin', () => {
    useDurableWorkflowsStore.setState({ engineUrl: 'https://other.example' });
    render(<ConnectionNotice chat={chat} />);
    expect(screen.getByText(/Restore that connection/)).toBeInTheDocument();
    expect(durableChatController.refresh).not.toHaveBeenCalled();
  });
});

describe('connection recovery interactions', () => {
  it('opens settings for a rejected connection without retrying or changing the URL', () => {
    const settings = vi.fn();
    store.setState({
      connections: { chat: { status: 'attention', failures: 1, message: 'Invalid credentials' } },
    });
    render(<ConnectionNotice chat={chat} onOpenSettings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open connection settings' }));
    expect(settings).toHaveBeenCalledOnce();
    expect(durableChatController.refresh).not.toHaveBeenCalled();
    expect(useDurableWorkflowsStore.getState().engineUrl).toBe('https://engine.example');
    expect(screen.getByText('No successful sync yet')).toBeInTheDocument();
  });
  it('shows the age of saved observations outside the live announcement', () => {
    store.setState({
      connections: {
        chat: {
          status: 'reconnecting',
          failures: 1,
          lastSyncedAt: Date.now() - 125000,
          nextRetryAt: Date.now() + 30000,
        },
      },
    });
    render(<ConnectionNotice chat={chat} />);
    expect(screen.getByText('Last synced 2 minutes ago').closest('[role="status"]')).toBeNull();
    expect(screen.getByRole('status')).not.toHaveTextContent('Retry in');
  });
  it('prevents duplicate manual refreshes, reports failures and allows another try', async () => {
    let finish!: () => void;
    vi.mocked(durableChatController.refresh).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(<ConnectionNotice chat={chat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    const checking = screen.getByRole('button', { name: 'Checking connection…' });
    expect(checking).toBeDisabled();
    fireEvent.click(checking);
    expect(durableChatController.refresh).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    vi.mocked(durableChatController.refresh).mockRejectedValueOnce(
      new Error('Refresh unavailable')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    vi.mocked(durableChatController.refresh).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  it('reacts to online events and stops its clock after a successful connection', () => {
    vi.useFakeTimers();
    render(<ConnectionNotice chat={chat} />);
    expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeDisabled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    fireEvent(window, new Event('online'));
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeEnabled();
    act(() =>
      store.setState({
        connections: { chat: { status: 'connected', failures: 0, lastSyncedAt: Date.now() } },
      })
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('region', { name: 'Conversation connection' })).toBeNull();
  });
  it('offers settings, but no refresh, for another workflow engine', () => {
    useDurableWorkflowsStore.setState({ engineUrl: 'https://other.example' });
    const settings = vi.fn();
    render(<ConnectionNotice chat={chat} onOpenSettings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open connection settings' }));
    expect(settings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull();
    expect(durableChatController.refresh).not.toHaveBeenCalled();
  });
});
