/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ChatPlayground } from './ChatPlayground';

// ChatPlayground is a routed page and now renders a <Link> in its MCP notice.
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
import type { ChatConversation, ChatMessage } from '../../../types';

const mockUseChatPlayground = vi.fn();
const mockUseChatHistory = vi.fn();
const mockShowToast = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockClearEvents = vi.fn();

vi.mock('../hooks/useChatPlayground', () => ({
  useChatPlayground: (...args: unknown[]) => mockUseChatPlayground(...args),
}));

vi.mock('../../connections/hooks/useMcpServerOptions', () => ({
  useMcpServerOptions: () => [
    {
      id: 'stateset-sync',
      name: 'StateSet Sync',
      isLocalOnly: false,
      isMcpServer: true,
      connected: true,
    },
    { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
    { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
  ],
  useMcpServerOptionsState: () => ({
    options: [
      {
        id: 'stateset-sync',
        name: 'StateSet Sync',
        isLocalOnly: false,
        isMcpServer: true,
        connected: true,
      },
      { id: 'shopify', name: 'Shopify', isLocalOnly: false, isMcpServer: true, connected: true },
      { id: 'gorgias', name: 'Gorgias', isLocalOnly: false, isMcpServer: true, connected: false },
    ],
    isLoading: false,
  }),
}));

vi.mock('../hooks/useChatHistory', () => ({
  useChatHistory: (...args: unknown[]) => mockUseChatHistory(...args),
}));

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../../stores/auth', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { tenant: { id: 'tenant-1' }, currentBrand: { id: 'brand-1' } };
    return selector ? selector(state) : state;
  },
}));

let mockStreamMessages: Record<string, unknown>[] = [];

vi.mock('../../../hooks/useAgentStream', () => ({
  useAgentStream: () => ({
    isConnected: false,
    isConnecting: false,
    isTyping: false,
    error: null,
    events: [],
    messages: mockStreamMessages,
    status: null,
    metrics: null,
    connect: mockConnect,
    disconnect: mockDisconnect,
    clearEvents: mockClearEvents,
  }),
}));

function makeMessage(content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return {
    id: `msg-${content}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

function makeConversation(id: string, title: string): ChatConversation {
  return {
    id,
    title,
    agentType: 'interactive',
    messages: [makeMessage(`message-${id}`)],
    createdAt: '2026-02-26T00:00:00.000Z',
    updatedAt: '2026-02-26T00:00:00.000Z',
  };
}

describe('ChatPlayground', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChatHistory.mockReturnValue({
      conversations: [],
      isLoaded: true,
      addConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });

    mockStreamMessages = [];
    mockUseChatPlayground.mockReturnValue({
      messages: [],
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat: vi.fn(),
      currentConversation: {
        title: 'New Chat',
        agentType: 'interactive',
        messages: [],
      },
    });
  });

  it('renders nothing while chat history is loading', () => {
    mockUseChatHistory.mockReturnValue({
      conversations: [],
      isLoaded: false,
      addConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });

    const { container } = render(<ChatPlayground />);
    expect(container.firstChild).toBeNull();
  });

  it('sends messages through the playground hook', () => {
    const sendMessage = vi.fn();
    mockUseChatPlayground.mockReturnValue({
      messages: [],
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage,
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat: vi.fn(),
      currentConversation: { title: 'New Chat', agentType: 'interactive', messages: [] },
    });

    render(<ChatPlayground />);

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'hello from playground' },
    });
    fireEvent.keyDown(screen.getByLabelText('Chat message'), { key: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('hello from playground');
  });

  it('passes selected model and temperature to useChatPlayground', () => {
    render(<ChatPlayground />);

    const modelSelect = screen.getByRole('combobox');
    const temperatureSlider = screen.getByRole('slider');

    fireEvent.change(modelSelect, { target: { value: 'claude-opus-4-6' } });
    fireEvent.change(temperatureSlider, { target: { value: '1.3' } });

    const lastCall = mockUseChatPlayground.mock.calls.at(-1)?.[0] as {
      model: string;
      temperature: number;
    };
    expect(lastCall).toMatchObject({
      model: 'claude-opus-4-6',
      temperature: 1.3,
    });
  });

  it('saves an unsaved conversation via addConversation', () => {
    const addConversation = vi.fn();
    const messages = [makeMessage('draft message')];
    mockUseChatHistory.mockReturnValue({
      conversations: [],
      isLoaded: true,
      addConversation,
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });
    mockUseChatPlayground.mockReturnValue({
      messages,
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat: vi.fn(),
      currentConversation: {
        title: 'Draft title',
        agentType: 'interactive',
        messages,
      },
    });

    render(<ChatPlayground />);

    fireEvent.click(screen.getByLabelText('Save conversation'));

    expect(addConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Draft title',
        agentType: 'interactive',
        messages,
      })
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      variant: 'success',
      title: 'Saved',
      message: 'Conversation saved.',
    });
  });

  it('updates an existing selected conversation when saving', () => {
    const existing = makeConversation('conversation-1', 'Existing Chat');
    const updateConversation = vi.fn();
    const loadConversation = vi.fn();
    const messages = [makeMessage('updated payload')];

    mockUseChatHistory.mockReturnValue({
      conversations: [existing],
      isLoaded: true,
      addConversation: vi.fn(),
      updateConversation,
      deleteConversation: vi.fn(),
    });
    mockUseChatPlayground.mockReturnValue({
      messages,
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation,
      startNewChat: vi.fn(),
      currentConversation: {
        title: 'Renamed Chat',
        agentType: 'interactive',
        messages,
      },
    });

    render(<ChatPlayground />);

    fireEvent.click(screen.getByLabelText('Open Existing Chat'));
    fireEvent.click(screen.getByLabelText('Save conversation'));

    expect(loadConversation).toHaveBeenCalledWith(existing);
    expect(updateConversation).toHaveBeenCalledWith('conversation-1', {
      messages,
      title: 'Renamed Chat',
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      variant: 'success',
      title: 'Saved',
      message: 'Conversation updated.',
    });
  });

  it('starts a new chat and preserves unsaved messages in history', () => {
    const addConversation = vi.fn();
    const startNewChat = vi.fn();
    const messages = [makeMessage('unsaved message')];

    mockUseChatHistory.mockReturnValue({
      conversations: [],
      isLoaded: true,
      addConversation,
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });
    mockUseChatPlayground.mockReturnValue({
      messages,
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat,
      currentConversation: {
        title: 'Unsaved Chat',
        agentType: 'interactive',
        messages,
      },
    });

    render(<ChatPlayground />);

    fireEvent.click(screen.getByLabelText('Start new chat'));

    expect(addConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unsaved Chat',
        agentType: 'interactive',
        messages,
      })
    );
    expect(startNewChat).toHaveBeenCalled();
  });

  it('sends a suggested prompt when clicked', () => {
    const sendMessage = vi.fn();
    mockUseChatPlayground.mockReturnValue({
      messages: [],
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage,
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat: vi.fn(),
      currentConversation: { title: 'New Chat', agentType: 'interactive', messages: [] },
    });

    render(<ChatPlayground />);

    const promptButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent?.includes('Summarize'));
    if (promptButtons.length > 0) {
      fireEvent.click(promptButtons[0]);
      expect(sendMessage).toHaveBeenCalled();
    }
  });

  it('passes the chosen MCP servers to the chat session', () => {
    render(<ChatPlayground />);

    fireEvent.click(screen.getByRole('button', { name: /MCP servers/ }));
    fireEvent.click(screen.getByRole('button', { name: /StateSet Sync/ }));

    expect(mockUseChatPlayground).toHaveBeenLastCalledWith(
      expect.objectContaining({ mcpServers: ['stateset-sync'] })
    );
  });

  describe('MCP tool activity', () => {
    function mockHook(overrides: Record<string, unknown> = {}) {
      const base = {
        messages: [],
        isLoading: false,
        setIsLoading: vi.fn(),
        activeSessionId: 'session-1',
        sendMessage: vi.fn(),
        appendMessage: vi.fn(),
        updateMessage: vi.fn(),
        loadConversation: vi.fn(),
        startNewChat: vi.fn(),
        currentConversation: { title: 'New Chat', agentType: 'interactive', messages: [] },
        ...overrides,
      };
      mockUseChatPlayground.mockReturnValue(base);
      return base;
    }

    it('records a tool call from the stream', () => {
      mockStreamMessages = [
        {
          _id: 'evt-1',
          _timestamp: 1234,
          type: 'tool_call',
          id: 'call-1',
          tool_name: 'list_orders',
          arguments: { limit: 5 },
        },
      ];
      const hook = mockHook();
      render(<ChatPlayground />);

      // Upserted rather than appended: a replayed call must not duplicate a key.
      expect(hook.updateMessage).toHaveBeenCalledWith(
        'tool-call-1',
        expect.any(Function),
        expect.objectContaining({
          id: 'tool-call-1',
          role: 'tool',
          content: 'list_orders',
          tool: { name: 'list_orders', status: 'running', arguments: { limit: 5 } },
        })
      );
      const [, updater, fallback] = (hook.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(updater(fallback)).toMatchObject({
        tool: { name: 'list_orders', status: 'running' },
      });
    });

    it('completes the tool call when its result arrives', () => {
      mockStreamMessages = [
        {
          _id: 'evt-2',
          _timestamp: 2000,
          type: 'tool_result',
          tool_call_id: 'call-1',
          result: { orders: [] },
          success: true,
          duration_ms: 128,
        },
      ];
      const hook = mockHook();
      render(<ChatPlayground />);

      expect(hook.updateMessage).toHaveBeenCalledWith(
        'tool-call-1',
        expect.any(Function),
        expect.objectContaining({ id: 'tool-call-1', role: 'tool' })
      );
      const updater = (hook.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(
        updater({
          id: 'tool-call-1',
          role: 'tool',
          content: 'list_orders',
          timestamp: 1234,
          tool: { name: 'list_orders', status: 'running', arguments: { limit: 5 } },
        })
      ).toMatchObject({
        tool: {
          name: 'list_orders',
          status: 'success',
          arguments: { limit: 5 },
          resultPreview: '{"orders":[]}',
          durationMs: 128,
        },
      });
    });

    it('marks a failed tool result as an error', () => {
      mockStreamMessages = [
        {
          _id: 'evt-3',
          _timestamp: 2000,
          type: 'tool_result',
          tool_call_id: 'call-9',
          result: 'boom',
          success: false,
          duration_ms: 7,
        },
      ];
      const hook = mockHook();
      render(<ChatPlayground />);

      const updater = (hook.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(
        updater({ id: 'tool-call-9', role: 'tool', content: 'sync', timestamp: 1 })
      ).toMatchObject({ tool: { name: 'sync', status: 'error', resultPreview: 'boom' } });
    });

    it('still records a result whose tool call never arrived', () => {
      mockStreamMessages = [
        {
          _id: 'evt-orphan',
          _timestamp: 3000,
          type: 'tool_result',
          tool_call_id: 'lost',
          result: 'done',
          success: true,
          duration_ms: 5,
        },
      ];
      const hook = mockHook();
      render(<ChatPlayground />);

      const [, updater, fallback] = (hook.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      // The fallback stands in for the tool_call lost to a stream reconnect.
      expect(updater(fallback)).toMatchObject({
        id: 'tool-lost',
        role: 'tool',
        // Honest about not knowing the name rather than inventing "tool".
        tool: { name: 'unknown tool', status: 'success', resultPreview: 'done', durationMs: 5 },
      });
    });

    it('keeps a completed result when its call is replayed after a reconnect', () => {
      mockStreamMessages = [
        {
          _id: 'evt-replay',
          _timestamp: 4000,
          type: 'tool_call',
          id: 'call-7',
          tool_name: 'list_orders',
          arguments: { limit: 2 },
        },
      ];
      const hook = mockHook();
      render(<ChatPlayground />);

      const [, updater] = (hook.updateMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const alreadyFinished = {
        id: 'tool-call-7',
        role: 'tool' as const,
        content: 'list_orders',
        timestamp: 1,
        tool: { name: 'list_orders', status: 'success' as const, durationMs: 12 },
      };

      // The replayed call must not knock a finished tool back to "running".
      expect(updater(alreadyFinished)).toMatchObject({
        tool: { status: 'success', durationMs: 12, arguments: { limit: 2 } },
      });
    });

    it('renders tool messages as tool activity, not chat bubbles', () => {
      mockHook({
        messages: [
          {
            id: 'tool-call-1',
            role: 'tool',
            content: 'list_orders',
            timestamp: Date.now(),
            tool: { name: 'list_orders', status: 'running' },
          },
        ],
      });
      render(<ChatPlayground />);

      expect(screen.getByText('list_orders')).toBeInTheDocument();
      expect(screen.getByText('Running…')).toBeInTheDocument();
      expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
    });
  });

  it('warns when a chosen chat server has no credentials', () => {
    render(<ChatPlayground />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /MCP servers/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gorgias/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Gorgias');
  });

  it('does not warn for a connected server', () => {
    render(<ChatPlayground />);

    fireEvent.click(screen.getByRole('button', { name: /MCP servers/ }));
    fireEvent.click(screen.getByRole('button', { name: /StateSet Sync/ }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('saves the stripped transcript, never raw tool payloads', () => {
    const addConversation = vi.fn();
    const rawMessages = [
      {
        id: 'tool-1',
        role: 'tool' as const,
        content: 'list_orders',
        timestamp: 1,
        tool: {
          name: 'list_orders',
          status: 'success' as const,
          arguments: { token: 'sk_live_secret' },
          resultPreview: 'customer@example.com',
        },
      },
    ];
    mockUseChatHistory.mockReturnValue({
      conversations: [],
      isLoaded: true,
      addConversation,
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });
    mockUseChatPlayground.mockReturnValue({
      messages: rawMessages,
      isLoading: false,
      setIsLoading: vi.fn(),
      activeSessionId: null,
      sendMessage: vi.fn(),
      appendMessage: vi.fn(),
      updateMessage: vi.fn(),
      loadConversation: vi.fn(),
      startNewChat: vi.fn(),
      currentConversation: {
        title: 'With tools',
        agentType: 'interactive',
        // What the hook exposes for persistence: payloads already removed.
        messages: [{ ...rawMessages[0], tool: { name: 'list_orders', status: 'success' } }],
      },
    });

    render(<ChatPlayground />);
    fireEvent.click(screen.getByLabelText('Save conversation'));

    const saved = JSON.stringify(addConversation.mock.calls[0][0]);
    expect(saved).not.toContain('sk_live_secret');
    expect(saved).not.toContain('customer@example.com');
  });
});
