/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationList } from './ConversationList';
import type { ChatConversation, ChatMessage } from '../../../types';

function makeMessage(id: string): ChatMessage {
  return { id, role: 'user', content: 'hello', timestamp: 1700000000000 };
}

function makeConversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'convo-1',
    title: 'First chat',
    agentType: 'support',
    messages: [makeMessage('m1')],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof ConversationList>[0]> = {}) {
  return {
    conversations: [makeConversation()],
    activeId: undefined as string | undefined,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onNewChat: vi.fn(),
    ...overrides,
  };
}

describe('ConversationList', () => {
  it('renders the empty state when there are no conversations', () => {
    render(<ConversationList {...makeProps({ conversations: [] })} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('renders conversation titles with message counts (singular and plural)', () => {
    render(
      <ConversationList
        {...makeProps({
          conversations: [
            makeConversation(),
            makeConversation({
              id: 'convo-2',
              title: 'Second chat',
              messages: [makeMessage('m1'), makeMessage('m2')],
            }),
          ],
        })}
      />
    );

    expect(screen.getByText('First chat')).toBeInTheDocument();
    expect(screen.getByText('1 msg')).toBeInTheDocument();
    expect(screen.getByText('Second chat')).toBeInTheDocument();
    expect(screen.getByText('2 msgs')).toBeInTheDocument();
  });

  it('calls onNewChat from the new chat button', () => {
    const props = makeProps();
    render(<ConversationList {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start new chat' }));
    expect(props.onNewChat).toHaveBeenCalledTimes(1);
  });

  it('selects a conversation on click', () => {
    const props = makeProps();
    render(<ConversationList {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open First chat' }));
    expect(props.onSelect).toHaveBeenCalledWith(props.conversations[0]);
  });

  it('selects a conversation with Enter and Space keys', () => {
    const props = makeProps();
    render(<ConversationList {...props} />);
    const row = screen.getByRole('button', { name: 'Open First chat' });

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(props.onSelect).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(row, { key: 'Escape' });
    expect(props.onSelect).toHaveBeenCalledTimes(2);
  });

  it('deletes a conversation without selecting it', () => {
    const props = makeProps();
    render(<ConversationList {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete conversation First chat' }));
    expect(props.onDelete).toHaveBeenCalledWith('convo-1');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('marks the active conversation with aria-current', () => {
    render(
      <ConversationList
        {...makeProps({
          conversations: [makeConversation(), makeConversation({ id: 'convo-2', title: 'Other' })],
          activeId: 'convo-1',
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Open First chat' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Open Other' })).not.toHaveAttribute('aria-current');
  });
});
