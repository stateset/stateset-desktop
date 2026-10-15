/** @vitest-environment happy-dom */
import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useComputerChatRecovery } from './useComputerChatRecovery';
import { useAuthStore } from '../stores/auth';
import { useDurableWorkflowsStore as engine } from '../stores/durableWorkflows';
import { useComputerChatsStore as chats } from '../features/computer-chat/store';
import { durableChatController } from '../features/computer-chat/durable';
import { DEFAULT_CHAT_CONFIGURATION } from '../features/computer-chat/durableTypes';
import type { ComputerChat } from '../features/computer-chat/types';

const initializeEngine = engine.getState().initialize;
const initializeChats = chats.getState().initialize;
function chat(id: string, brandId = 'brand'): ComputerChat {
  return {
    id,
    tenantId: 'tenant',
    brandId,
    title: id,
    createdAt: 'now',
    updatedAt: 'now',
    messages: [],
    workflows: [],
    durableSession: {
      version: 2,
      workflowId: id,
      engineUrl: 'https://engine.example',
      configuration: DEFAULT_CHAT_CONFIGURATION,
    },
  };
}
beforeEach(() => {
  useAuthStore.setState({ tenant: { id: 'tenant' }, currentBrand: { id: 'brand' } } as never);
  chats.setState({
    chats: [chat('active')],
    busy: {},
    connections: {},
    loaded: true,
    initialize: vi.fn().mockResolvedValue(undefined),
  });
  engine.setState({
    engineUrl: 'https://engine.example',
    apiKey: null,
    initialize: vi.fn().mockResolvedValue(undefined),
  });
  vi.spyOn(durableChatController, 'refresh').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  engine.setState({ initialize: initializeEngine });
  chats.setState({ initialize: initializeChats });
});
describe('computer conversation reconciliation', () => {
  it('waits for the saved engine configuration before requesting a conversation', async () => {
    let ready!: () => void;
    engine.setState({
      initialize: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            ready = resolve;
          })
      ),
    });
    renderHook(() => useComputerChatRecovery());
    expect(durableChatController.refresh).not.toHaveBeenCalled();
    await act(async () => ready());
    await waitFor(() => expect(durableChatController.refresh).toHaveBeenCalledWith('active'));
  });
  it('only reconciles active conversations in the selected organization and brand', async () => {
    const stopped = {
      ...chat('stopped'),
      serverState: { status: 'stopped', cleanup_verified: true },
    } as ComputerChat;
    chats.setState({
      chats: [
        chat('active'),
        chat('another-brand', 'different'),
        { ...chat('another-org'), tenantId: 'other' },
        stopped,
      ],
    });
    renderHook(() => useComputerChatRecovery());
    await waitFor(() => expect(durableChatController.refresh).toHaveBeenCalledTimes(1));
    expect(durableChatController.refresh).toHaveBeenCalledWith('active');
  });
  it('does not request old scope data when unmounted during initialization', async () => {
    let ready!: () => void;
    engine.setState({
      initialize: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            ready = resolve;
          })
      ),
    });
    const { unmount } = renderHook(() => useComputerChatRecovery());
    unmount();
    await act(async () => ready());
    expect(durableChatController.refresh).not.toHaveBeenCalled();
  });
  it('limits request starts, rotates fairly, and continues around a stalled conversation', async () => {
    vi.useFakeTimers();
    const releases: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    vi.mocked(durableChatController.refresh).mockImplementation(() => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise<void>((resolve) => releases.push(resolve)).finally(() => {
        active--;
      });
    });
    chats.setState({ chats: Array.from({ length: 7 }, (_, i) => chat(`chat-${i}`)) });
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      // Keep chat-0 stalled; the other three slots can continue next tick.
      releases.slice(1).forEach((release) => release());
    });
    window.dispatchEvent(new Event('online'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(vi.mocked(durableChatController.refresh).mock.calls.map(([id]) => id)).toEqual([
      'chat-0',
      'chat-1',
      'chat-2',
      'chat-3',
      'chat-4',
      'chat-5',
      'chat-6',
    ]);
    await act(async () => {
      releases.slice(4).forEach((release) => release());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(
      vi
        .mocked(durableChatController.refresh)
        .mock.calls.slice(7)
        .map(([id]) => id)
    ).toEqual(['chat-1', 'chat-2', 'chat-3']);
    expect(maximum).toBe(4);
    await act(async () => {
      releases.forEach((resolve) => resolve());
    });
  });

  it('skips retry cooldowns and rejected credentials until an explicit reconnect', async () => {
    chats.setState({
      connections: {
        active: { status: 'reconnecting', failures: 3, nextRetryAt: Date.now() + 60000 },
      },
    });
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(durableChatController.refresh).toHaveBeenCalledWith('active'));
  });

  it('does not poll offline and resumes when the connection returns', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      renderHook(() => useComputerChatRecovery());
      await act(async () => {
        await Promise.resolve();
      });
      expect(durableChatController.refresh).not.toHaveBeenCalled();
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      await waitFor(() => expect(durableChatController.refresh).toHaveBeenCalledWith('active'));
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('keeps archived computers synchronized and retries after credentials change', async () => {
    vi.useFakeTimers();
    chats.setState({ chats: [{ ...chat('active'), archived: true }] });
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(1);
    chats.setState({
      connections: { active: { status: 'attention', failures: 1, message: 'Invalid key' } },
    });
    await act(async () => {
      engine.setState({ apiKey: 'updated-key' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps the request budget and occupied slots across scope changes', async () => {
    vi.useFakeTimers();
    const releases: (() => void)[] = [];
    vi.mocked(durableChatController.refresh).mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve))
    );
    chats.setState({
      chats: [
        ...Array.from({ length: 5 }, (_, i) => chat(`a-${i}`)),
        ...Array.from({ length: 5 }, (_, i) => chat(`b-${i}`, 'different')),
      ],
    });
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      useAuthStore.setState({ currentBrand: { id: 'different' } } as never);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      releases.forEach((release) => release());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(
      vi
        .mocked(durableChatController.refresh)
        .mock.calls.slice(4)
        .map(([id]) => id)
    ).toEqual(['b-0', 'b-1', 'b-2', 'b-3']);
    await act(async () => {
      releases.forEach((release) => release());
    });
  });

  it('retries every blocked conversation fairly after credentials change', async () => {
    vi.useFakeTimers();
    const library = Array.from({ length: 8 }, (_, i) => chat(`chat-${i}`));
    chats.setState({
      chats: library,
      connections: Object.fromEntries(
        library.map((c) => [
          c.id,
          {
            status: 'attention' as const,
            failures: 1,
            message: 'Invalid key',
          },
        ])
      ),
    });
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      await Promise.resolve();
    });
    expect(durableChatController.refresh).not.toHaveBeenCalled();
    await act(async () => {
      engine.setState({ apiKey: 'new-key' });
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(vi.mocked(durableChatController.refresh).mock.calls.map(([id]) => id)).toEqual(
      library.map((c) => c.id)
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(durableChatController.refresh).toHaveBeenCalledTimes(8);
  });

  it('flushes a pending draft when the app is hidden', async () => {
    const flush = vi.spyOn(chats.getState(), 'flushDrafts').mockResolvedValue(undefined);
    renderHook(() => useComputerChatRecovery());
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
