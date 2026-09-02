/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageBubble } from './ChatMessageBubble';
import type { ChatMessage } from '../../../types';

vi.mock('../../../components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello there',
    timestamp: 1700000000000,
    ...overrides,
  };
}

describe('ChatMessageBubble', () => {
  it('renders a user message as plain text with the You label', () => {
    render(<ChatMessageBubble message={makeMessage()} />);

    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it('renders an assistant message through Markdown with the Assistant label', () => {
    render(
      <ChatMessageBubble
        message={makeMessage({ role: 'assistant', content: '**bold** response' })}
      />
    );

    expect(screen.getByTestId('markdown')).toHaveTextContent('**bold** response');
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });

  it('renders a system message as plain text with the System label', () => {
    render(<ChatMessageBubble message={makeMessage({ role: 'system', content: 'Error!' })} />);

    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it('renders the formatted timestamp', () => {
    const timestamp = 1700000000000;
    render(<ChatMessageBubble message={makeMessage({ timestamp })} />);
    expect(screen.getByText(new Date(timestamp).toLocaleTimeString())).toBeInTheDocument();
  });

  it('shows the duration when provided', () => {
    render(<ChatMessageBubble message={makeMessage({ role: 'assistant', durationMs: 1234 })} />);
    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  it('omits the duration when not provided', () => {
    render(<ChatMessageBubble message={makeMessage()} />);
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });
});
