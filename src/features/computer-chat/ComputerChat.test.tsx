/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComputerChat } from './ComputerChat';
import { useComputerChatsStore } from './store';
import { useAuthStore } from '../../stores/auth';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { computerChatRuntime } from './runtime';
import type { ComputerChat as Chat } from './types';

vi.mock('./runtime', () => ({
  computerChatRuntime: {
    create: vi.fn(),
    provision: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    screenshot: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  },
}));
vi.mock('./ComputerChatSettings', () => ({ ComputerChatSettings: () => <div>Chat settings</div> }));
vi.mock('../chat-playground/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
}));
vi.mock('../chat-playground/components/ToolActivityBubble', () => ({
  ToolActivityBubble: () => <p>Tool activity</p>,
}));

function fixture(title: string): Chat {
  return {
    id: crypto.randomUUID(),
    tenantId: 'tenant',
    brandId: 'brand',
    title,
    createdAt: '',
    updatedAt: '',
    workflows: [],
    messages: [{ id: 'msg', role: 'user', content: `${title} history`, timestamp: 1 }],
    session: {
      id: `${title}-session`,
      organizationId: 'org',
      currentSandboxId: `${title}-sandbox`,
      status: 'running',
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  useDurableWorkflowsStore.setState({ initialized: true, initializationError: null });
  useAuthStore.setState({
    tenant: { id: 'tenant' } as never,
    currentBrand: { id: 'brand' } as never,
  });
  useComputerChatsStore.setState({
    chats: [fixture('First'), fixture('Second')],
    loaded: true,
    busy: {},
  });
});

describe('computer conversations UI', () => {
  it('opens each saved chat with its own transcript and computer', () => {
    render(<ComputerChat />);
    fireEvent.click(screen.getByText('First'));
    expect(screen.getByText('First history')).toBeInTheDocument();
    expect(screen.getByText(/Session: First-session/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Second'));
    expect(screen.getByText('Second history')).toBeInTheDocument();
    expect(screen.queryByText('First history')).not.toBeInTheDocument();
    expect(computerChatRuntime.provision).not.toHaveBeenCalled();
  });

  it('creates a new chat and provisions its computer immediately', async () => {
    vi.mocked(computerChatRuntime.create).mockResolvedValue('new-chat');
    render(<ComputerChat />);
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    await waitFor(() => expect(computerChatRuntime.provision).toHaveBeenCalledWith('new-chat'));
    expect(computerChatRuntime.create).toHaveBeenCalledWith('tenant', 'brand');
  });

  it('shows action recovery and disables sending until it is resolved', () => {
    const chat = fixture('Pending');
    chat.pending = {
      requestId: crypto.randomUUID(),
      action: { name: 'execute', arguments: { command: ['pwd'] } },
      command: ['pwd'],
      durable: true,
      verify: true,
    };
    useComputerChatsStore.setState({ chats: [chat] });
    render(<ComputerChat />);
    fireEvent.click(screen.getByText('Pending'));
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Resume action' }));
    expect(computerChatRuntime.resume).toHaveBeenCalledWith(chat.id);
  });

  it('hides chats belonging to another brand', () => {
    useAuthStore.setState({ currentBrand: { id: 'other-brand' } as never });
    render(<ComputerChat />);
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });
});
