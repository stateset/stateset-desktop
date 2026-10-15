/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPlayground } from './useChatPlayground';
import type { ChatConversation } from '../../../types';

const mockCreateSession = vi.fn();
const mockStartSession = vi.fn();
const mockSendMessage = vi.fn();
const mockUpdateConfig = vi.fn();
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
    updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
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
    mockUpdateConfig.mockResolvedValue(undefined);
  });

  it('creates the session with the selected MCP servers', async () => {
    const { result } = renderHook(() =>
      useChatPlayground({ mcpServers: ['stateset-response', 'shopify'] })
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'interactive',
      expect.objectContaining({ mcp_servers: ['stateset-response', 'shopify'] })
    );
  });

  it('defaults to no MCP servers', async () => {
    const { result } = renderHook(() => useChatPlayground());

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'interactive',
      expect.objectContaining({ mcp_servers: [] })
    );
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

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello world',
    });
    expect(result.current.activeSessionId).toBe('session-1');
    expect(result.current.isLoading).toBe(true);
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
    expect(result.current.messages).toHaveLength(2);
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

  it('updates one message in place and leaves the others alone', async () => {
    const { result } = renderHook(() => useChatPlayground());

    act(() => {
      result.current.appendMessage({
        id: 'tool-1',
        role: 'tool',
        content: 'list_orders',
        timestamp: 1,
        tool: { name: 'list_orders', status: 'running' },
      });
      result.current.appendMessage({
        id: 'tool-2',
        role: 'tool',
        content: 'get_order',
        timestamp: 2,
        tool: { name: 'get_order', status: 'running' },
      });
    });

    act(() => {
      result.current.updateMessage('tool-1', (message) => ({
        ...message,
        tool: { ...message.tool!, status: 'success', durationMs: 12 },
      }));
    });

    expect(result.current.messages[0].tool).toEqual({
      name: 'list_orders',
      status: 'success',
      durationMs: 12,
    });
    expect(result.current.messages[1].tool).toEqual({ name: 'get_order', status: 'running' });
  });

  it('ignores an update for an unknown message id', () => {
    const { result } = renderHook(() => useChatPlayground());

    act(() => {
      result.current.updateMessage('missing', (message) => ({ ...message, content: 'changed' }));
    });

    expect(result.current.messages).toEqual([]);
  });

  it('surfaces a missing brand as a send error, never a render crash', async () => {
    const onError = vi.fn();
    const rendered = renderHook(
      ({ mcpServers }: { mcpServers: string[] }) => useChatPlayground({ mcpServers, onError }),
      { initialProps: { mcpServers: ['shopify'] } }
    );

    await act(async () => {
      await rendered.result.current.sendMessage('first');
    });

    mockRequireBrandId.mockImplementation(() => {
      throw new Error('No brand selected');
    });

    // Changing the selection does no work, so it cannot throw while rendering.
    expect(() => rendered.rerender({ mcpServers: ['gorgias'] })).not.toThrow();

    await act(async () => {
      await rendered.result.current.sendMessage('second');
    });

    expect(onError).toHaveBeenCalledWith('No brand selected');
    mockRequireBrandId.mockImplementation(
      (brand: { id?: string } | null) => brand?.id ?? 'brand-1'
    );
  });

  it('appends a fallback message when the target of an update is missing', () => {
    const { result } = renderHook(() => useChatPlayground());

    act(() => {
      result.current.updateMessage(
        'tool-orphan',
        (message) => ({ ...message, content: 'recovered' }),
        { id: 'tool-orphan', role: 'tool', content: 'tool', timestamp: 5 }
      );
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: 'tool-orphan', content: 'recovered' });
  });

  describe('keeping a live session in step with the selection', () => {
    async function startChat(servers: string[]) {
      const rendered = renderHook(
        ({ mcpServers }: { mcpServers: string[] }) => useChatPlayground({ mcpServers }),
        { initialProps: { mcpServers: servers } }
      );
      await act(async () => {
        await rendered.result.current.sendMessage('first');
      });
      return rendered;
    }

    it('does not touch an idle session when the selection changes', async () => {
      const { rerender } = await startChat(['shopify']);

      rerender({ mcpServers: ['shopify', 'gorgias'] });
      await act(async () => {
        await Promise.resolve();
      });

      // Nothing is sent until it matters: the session is idle.
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('applies the selection before the next message is sent', async () => {
      const { result, rerender } = await startChat(['shopify']);

      rerender({ mcpServers: ['shopify', 'gorgias'] });
      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockUpdateConfig).toHaveBeenCalledWith(
        'tenant-1',
        'brand-1',
        'session-1',
        expect.objectContaining({ mcp_servers: ['shopify', 'gorgias'] })
      );
      expect(mockSendMessage).toHaveBeenLastCalledWith(
        'tenant-1',
        'brand-1',
        'session-1',
        'second'
      );
    });

    it('sends only the latest selection after several changes', async () => {
      const { result, rerender } = await startChat(['shopify']);

      rerender({ mcpServers: ['a'] });
      rerender({ mcpServers: ['a', 'b'] });
      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateConfig).toHaveBeenCalledWith(
        'tenant-1',
        'brand-1',
        'session-1',
        expect.objectContaining({ mcp_servers: ['a', 'b'] })
      );
    });

    it('does not re-apply a selection that is already in force', async () => {
      const { result } = await startChat(['shopify']);

      await act(async () => {
        await result.current.sendMessage('second');
      });

      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('reports a failure to apply instead of answering with the old tools', async () => {
      const onError = vi.fn();
      mockUpdateConfig.mockRejectedValueOnce(new Error('config rejected'));
      const rendered = renderHook(
        ({ mcpServers }: { mcpServers: string[] }) => useChatPlayground({ mcpServers, onError }),
        { initialProps: { mcpServers: ['shopify'] } }
      );
      await act(async () => {
        await rendered.result.current.sendMessage('first');
      });

      rendered.rerender({ mcpServers: ['gorgias'] });
      await act(async () => {
        await rendered.result.current.sendMessage('second');
      });

      expect(onError).toHaveBeenCalledWith('config rejected');
      // The message was not sent against the previous tool set.
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // A later send retries, since the selection was never applied.
      mockUpdateConfig.mockResolvedValue(undefined);
      await act(async () => {
        await rendered.result.current.sendMessage('third');
      });
      expect(mockUpdateConfig).toHaveBeenLastCalledWith(
        'tenant-1',
        'brand-1',
        'session-1',
        expect.objectContaining({ mcp_servers: ['gorgias'] })
      );
    });

    it('starts a new chat on the current selection with no config call', async () => {
      const { result, rerender } = await startChat(['shopify']);

      rerender({ mcpServers: ['gorgias'] });
      act(() => {
        result.current.startNewChat();
      });
      mockCreateSession.mockResolvedValue({ id: 'session-2' });
      await act(async () => {
        await result.current.sendMessage('new chat');
      });

      expect(mockCreateSession).toHaveBeenLastCalledWith(
        'tenant-1',
        'brand-1',
        'interactive',
        expect.objectContaining({ mcp_servers: ['gorgias'] })
      );
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });
  });

  it('carries the current model into the config it pushes', async () => {
    const rendered = renderHook(
      ({ model, mcpServers }: { model: string; mcpServers: string[] }) =>
        useChatPlayground({ model, mcpServers }),
      { initialProps: { model: 'claude-sonnet-4-6', mcpServers: ['shopify'] } }
    );
    await act(async () => {
      await rendered.result.current.sendMessage('first');
    });

    // The user changes both the model and the servers, then sends.
    rendered.rerender({ model: 'claude-opus-4-6', mcpServers: ['gorgias'] });
    await act(async () => {
      await rendered.result.current.sendMessage('second');
    });

    // The push must not re-assert the model the session was created with.
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'session-1',
      expect.objectContaining({ model: 'claude-opus-4-6', mcp_servers: ['gorgias'] })
    );
  });

  it('applies a model change on its own, without a server change', async () => {
    const rendered = renderHook(
      ({ model }: { model: string }) => useChatPlayground({ model, mcpServers: ['shopify'] }),
      { initialProps: { model: 'claude-sonnet-4-6' } }
    );
    await act(async () => {
      await rendered.result.current.sendMessage('first');
    });

    rendered.rerender({ model: 'claude-opus-4-6' });
    await act(async () => {
      await rendered.result.current.sendMessage('second');
    });

    // The session must not keep answering as the old model.
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      'tenant-1',
      'brand-1',
      'session-1',
      expect.objectContaining({ model: 'claude-opus-4-6' })
    );
  });
});
