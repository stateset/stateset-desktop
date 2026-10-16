/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationTranscript } from './ConversationTranscript';
import type { ComputerChat } from './types';
vi.mock('../chat-playground/components/ChatMessageBubble', () => ({
  ChatMessageBubble: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scrollGeometry(element: HTMLElement, top = 100) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, writable: true, value: top },
  });
}

function resizeObserver() {
  let notify: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
  );
  return { resize: () => act(() => notify?.()), disconnect };
}
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

  it('keeps the older visible messages when new output crosses the hundred-message window', () => {
    const original = fixture(130);
    const { rerender } = render(<ConversationTranscript chat={original} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript);
    fireEvent.scroll(transcript);
    rerender(<ConversationTranscript chat={fixture(240)} />);
    expect(screen.getByText('Message 30', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show older messages (30)' })).toBeInTheDocument();
    expect(transcript.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show older messages (30)' }));
    expect(screen.getByText('Message 0', { exact: true })).toBeInTheDocument();
  });

  it('restores keyboard focus to the transcript when returning to latest removes its button', () => {
    render(<ConversationTranscript chat={fixture(130)} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript);
    fireEvent.scroll(transcript);
    const latest = screen.getByRole('button', { name: 'Jump to latest' });
    latest.focus();
    fireEvent.click(latest);
    expect(transcript).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument();
  });

  it('restores keyboard focus when loading the last older messages removes its button', () => {
    render(<ConversationTranscript chat={fixture(130)} />);
    const older = screen.getByRole('button', { name: 'Show older messages (30)' });
    older.focus();
    fireEvent.click(older);
    expect(screen.getByLabelText('Chat transcript')).toHaveFocus();
  });

  it('keeps resized content at the bottom while following the latest messages', () => {
    const observer = resizeObserver();
    render(<ConversationTranscript chat={fixture(10)} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript, 1600);
    Object.defineProperty(transcript, 'scrollHeight', { configurable: true, value: 2400 });
    observer.resize();
    expect(transcript.scrollTop).toBe(2400);
  });

  it('leaves the reader and their focus in place when content resizes, and releases observers', () => {
    const observer = resizeObserver();
    const { unmount } = render(<ConversationTranscript chat={fixture(10)} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript);
    fireEvent.scroll(transcript);
    const latest = screen.getByRole('button', { name: 'Jump to latest' });
    latest.focus();
    Object.defineProperty(transcript, 'scrollHeight', { configurable: true, value: 2400 });
    observer.resize();
    expect(transcript.scrollTop).toBe(100);
    expect(latest).toHaveFocus();
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('counts new message identities while reading and clears the count when caught up', () => {
    const { rerender } = render(<ConversationTranscript chat={fixture(130)} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript);
    fireEvent.scroll(transcript);
    rerender(<ConversationTranscript chat={fixture(131)} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 new message below');
    rerender(<ConversationTranscript chat={fixture(131)} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 new message below');
    rerender(<ConversationTranscript chat={fixture(132)} />);
    expect(screen.getByRole('status')).toHaveTextContent('2 new messages below');
    transcript.scrollTop = 1600;
    fireEvent.scroll(transcript);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).not.toBeInTheDocument();
  });

  it('keeps the oldest retained history visible if retention removes the reading anchor', () => {
    const original = fixture(130);
    const { rerender } = render(<ConversationTranscript chat={original} />);
    const transcript = screen.getByLabelText('Chat transcript');
    scrollGeometry(transcript);
    fireEvent.scroll(transcript);
    const updated = fixture(240);
    rerender(
      <ConversationTranscript chat={{ ...updated, messages: updated.messages.slice(40) }} />
    );
    expect(screen.getByText('Message 40', { exact: true })).toBeInTheDocument();
    expect(transcript.scrollTop).toBe(100);
  });
});
