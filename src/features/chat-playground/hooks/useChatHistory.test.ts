/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChatHistory } from './useChatHistory';
import type { ChatConversation } from '../../../types';

function makeConversation(id: string): ChatConversation {
  return {
    id,
    title: `Conversation ${id}`,
    agentType: 'interactive',
    messages: [
      {
        id: `msg-${id}`,
        role: 'user',
        content: `hello-${id}`,
        timestamp: Date.now(),
      },
    ],
    createdAt: '2026-02-26T00:00:00.000Z',
    updatedAt: '2026-02-26T00:00:00.000Z',
  };
}

function mockElectronStore(storedValue: unknown = undefined) {
  const get = vi.fn().mockResolvedValue(storedValue);
  const set = vi.fn().mockResolvedValue(true);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      store: { get, set },
    } as unknown as Window['electronAPI'],
    writable: true,
    configurable: true,
  });

  return { get, set };
}

describe('useChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads stored conversations from electron store', async () => {
    const stored = [makeConversation('stored-1'), makeConversation('stored-2')];
    const { get } = mockElectronStore(stored);

    const { result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(get).toHaveBeenCalledWith('chatPlaygroundConversations');
    expect(result.current.conversations).toEqual(stored);
  });

  it('adds a conversation and persists it', async () => {
    const { set } = mockElectronStore([]);
    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const convo = makeConversation('new-1');
    act(() => {
      result.current.addConversation(convo);
    });

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(result.current.conversations[0].id).toBe('new-1');

    const persisted = set.mock.calls.at(-1)?.[1] as ChatConversation[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe('new-1');
  });

  it('caps persisted history at 50 conversations', async () => {
    const { set } = mockElectronStore([]);
    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      for (let i = 0; i < 55; i += 1) {
        result.current.addConversation(makeConversation(`c-${i}`));
      }
    });

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(result.current.conversations).toHaveLength(50);
    expect(result.current.conversations[0].id).toBe('c-54');
    expect(result.current.conversations.at(-1)?.id).toBe('c-5');
  });

  it('updates a conversation and refreshes updatedAt', async () => {
    const original = makeConversation('updatable');
    const { set } = mockElectronStore([original]);

    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.updateConversation('updatable', { title: 'Updated title' });
    });

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(result.current.conversations[0].title).toBe('Updated title');
    expect(result.current.conversations[0].updatedAt).not.toBe(original.updatedAt);
  });

  it('deletes a conversation and persists remaining items', async () => {
    const first = makeConversation('first');
    const second = makeConversation('second');
    const { set } = mockElectronStore([first, second]);

    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.deleteConversation('first');
    });

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe('second');
  });

  it('still sets isLoaded when electronAPI is unavailable', async () => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;

    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.conversations).toEqual([]);
  });
});
