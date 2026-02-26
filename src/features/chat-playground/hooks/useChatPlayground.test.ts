/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPlayground } from './useChatPlayground';
import type { ChatConversation } from '../../../types';

const mockCreateSession = vi.fn();
const mockStartSession = vi.fn();
const mockSendMessage = vi.fn();
const mockRequireTenantId = vi.fn((tenant: { id?: string } | null) => tenant?.id ?? 'tenant-1');
const mockRequireBrandId = vi.fn((brand: { id?: string } | null) => brand?.id ?? 'brand-1');

let mockTenant: { id: string } | null = { id: 'tenant-1' };
let mockBrand: { id: string } | null = { id: 'brand-1' };

vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({
    tenant: mockTenant,
    currentBrand: mockBrand,
  }),
}));

vi.mock('../../../lib/api', () => ({
  agentApi: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    startSession: (...args: unknown[]) => mockStartSession(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}));

vi.mock('../../../lib/auth-guards', () => ({
  requireTenantId: (tenant: { id?: string } | null) => mockRequireTenantId(tenant),
  requireBrandId: (brand: { id?: string } | null) => mockRequireBrandId(brand),
}));

function makeConversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'conversation-1',
    title: 'Saved conversation',
    agentType: 'interactive',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'saved message',
        timestamp: Date.now(),
      },
    ],
    createdAt: '2026-02-26T00:00:00.000Z',
    updatedAt: '2026-02-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('useChatPlayground', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenant = { id: 'tenant-1' };
    mockBrand = { id: 'brand-1' };
    mockCreateSession.mockResolvedValue({ id: 'session-1' });
    mockStartSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
  });

  it('creates session with selected model/temperature and sends trimmed message', async () => {
    const { result } = renderHook(() =>
      useChatPlayground({ model: 'claude-opus-4-20250514', temperature: 1.1 })
    );

    await act(async () => {
      await result.current.sendMessage('  hello world  ');
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'interactive',
      expect.objectContaining({
        model: 'claude-opus-4-20250514',
        temperature: 1.1,
      })
    );
    expect(mockStartSession).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1');
    expect(mockSendMessage).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1', 'hello world');

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello world',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
    });
    expect(result.current.activeSessionId).toBe('session-1');
  });

  it('reuses existing session on subsequent messages', async () => {
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage('first');
    });
    await act(async () => {
      await result.current.sendMessage('second');
    });

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(result.current.messages).toHaveLength(4);
  });

  it('ignores blank messages', async () => {
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('reports errors and appends a system message when send fails', async () => {
    const onError = vi.fn();
    mockSendMessage.mockRejectedValue(new Error('send failed'));
    const { result } = renderHook(() => useChatPlayground({ onError }));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(onError).toHaveBeenCalledWith('send failed');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'system',
      content: 'Error: send failed',
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('loads a saved conversation and clears active session', async () => {
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage('before load');
    });
    expect(result.current.activeSessionId).toBe('session-1');

    const saved = makeConversation();
    act(() => {
      result.current.loadConversation(saved);
    });

    expect(result.current.messages).toEqual(saved.messages);
    expect(result.current.activeSessionId).toBeNull();
  });

  it('starts a new chat by clearing messages and session id', async () => {
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage('hello');
    });
    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.activeSessionId).toBe('session-1');

    act(() => {
      result.current.startNewChat();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
    expect(result.current.currentConversation.title).toBe('New Chat');
  });

  it('derives conversation title from first user message', async () => {
    const longMessage = 'x'.repeat(90);
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage(longMessage);
    });

    expect(result.current.currentConversation.title).toBe(longMessage.slice(0, 60));
  });
});
