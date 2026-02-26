/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPlayground } from './ChatPlayground';
import type { ChatConversation, ChatMessage } from '../../../types';

const mockUseChatPlayground = vi.fn();
const mockUseChatHistory = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../hooks/useChatPlayground', () => ({
  useChatPlayground: (...args: unknown[]) => mockUseChatPlayground(...args),
}));

vi.mock('../hooks/useChatHistory', () => ({
  useChatHistory: (...args: unknown[]) => mockUseChatHistory(...args),
}));

vi.mock('../../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
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

    mockUseChatPlayground.mockReturnValue({
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(),
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
      sendMessage,
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

    fireEvent.change(modelSelect, { target: { value: 'claude-opus-4-20250514' } });
    fireEvent.change(temperatureSlider, { target: { value: '1.3' } });

    const lastCall = mockUseChatPlayground.mock.calls.at(-1)?.[0] as {
      model: string;
      temperature: number;
    };
    expect(lastCall).toMatchObject({
      model: 'claude-opus-4-20250514',
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
      sendMessage: vi.fn(),
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
      sendMessage: vi.fn(),
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
      sendMessage: vi.fn(),
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
});
