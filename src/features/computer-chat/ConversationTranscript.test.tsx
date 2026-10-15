/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationTranscript } from './ConversationTranscript';
import type { ComputerChat } from './types';
vi.mock('../chat-playground/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
}));
afterEach(cleanup);
function fixture(count: number): ComputerChat {
  return {
    id: 'chat',
    messages: Array.from({ length: count }, (_, i) => ({
      id: String(i),
      role: 'user',
      content: `Message ${i}`,
      timestamp: i,
    })),
  } as ComputerChat;
}
describe('long conversation reading', () => {
  it('renders the latest hundred messages and lets the reader load earlier history', () => {
    render(<ConversationTranscript chat={fixture(130)} />);
    expect(screen.queryByText('Message 0', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Message 129', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show older messages (30)' }));
    expect(screen.getByText('Message 0', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument();
  });
  it('preserves a reader’s position when new messages arrive and provides an explicit return to live updates', () => {
    const original = fixture(10);
    const { rerender } = render(<ConversationTranscript chat={original} />);
    const transcript = screen.getByLabelText('Chat transcript');
    Object.defineProperties(transcript, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });
    fireEvent.scroll(transcript);
    rerender(
      <ConversationTranscript
        chat={{
          ...original,
          messages: [
            ...original.messages,
            { id: 'new', role: 'assistant', content: 'New result', timestamp: 11 },
          ],
        }}
      />
    );
    expect(transcript.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    expect(transcript.scrollTop).toBe(2000);
  });
});
