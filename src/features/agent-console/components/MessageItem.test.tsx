/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageItem } from './MessageItem';
import type { StreamEvent } from '../../../hooks/useAgentStream';

vi.mock('../../../components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

const TIMESTAMP = new Date('2026-02-15T12:00:00Z').getTime();

function makeMessageEvent(overrides: Record<string, unknown> = {}): StreamEvent {
  return {
    type: 'message',
    id: 'msg-1',
    role: 'user',
    content: 'Hello agent',
    _id: 'evt-1',
    _timestamp: TIMESTAMP,
    ...overrides,
  } as StreamEvent;
}

function makeToolCallEvent(overrides: Record<string, unknown> = {}): StreamEvent {
  return {
    type: 'tool_call',
    id: 'call-123456789',
    tool_name: 'get_order',
    arguments: { order_id: 'o-1' },
    _id: 'evt-2',
    _timestamp: TIMESTAMP,
    ...overrides,
  } as StreamEvent;
}

function makeToolResultEvent(overrides: Record<string, unknown> = {}): StreamEvent {
  return {
    type: 'tool_result',
    tool_call_id: 'call-123456789',
    result: { status: 'shipped' },
    success: true,
    duration_ms: 87,
    _id: 'evt-3',
    _timestamp: TIMESTAMP,
    ...overrides,
  } as StreamEvent;
}

function makeProps(event: StreamEvent, overrides: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  return {
    event,
    isExpanded: false,
    onToggle: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MessageItem', () => {
  describe('message events', () => {
    it('renders a user message as plain text with the You label', () => {
      render(<MessageItem {...makeProps(makeMessageEvent())} />);

      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Hello agent')).toBeInTheDocument();
      expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
    });

    it('renders an assistant message through Markdown with the Agent label', () => {
      render(
        <MessageItem
          {...makeProps(makeMessageEvent({ role: 'assistant', content: '# Heading' }))}
        />
      );

      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByTestId('markdown')).toHaveTextContent('# Heading');
    });

    it('highlights matches of the highlight term in user messages', () => {
      const { container } = render(
        <MessageItem
          {...makeProps(makeMessageEvent({ content: 'find the Order now' }), {
            highlightTerm: 'order',
          })}
        />
      );

      const mark = container.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark).toHaveTextContent('Order');
    });

    it('copies the message content to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      const onCopy = vi.fn();

      render(<MessageItem {...makeProps(makeMessageEvent(), { onCopy })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy message to clipboard' }));

      await waitFor(() => expect(onCopy).toHaveBeenCalledWith('Hello agent'));
      expect(writeText).toHaveBeenCalledWith('Hello agent');
    });
  });

  describe('thinking events', () => {
    it('renders the thinking status', () => {
      render(
        <MessageItem
          {...makeProps({
            type: 'thinking',
            content: 'Analyzing order history',
            _id: 'evt-t',
            _timestamp: TIMESTAMP,
          } as StreamEvent)}
        />
      );

      expect(screen.getByRole('status')).toHaveTextContent('Analyzing order history');
    });
  });

  describe('tool_call events', () => {
    it('renders the tool name and shortened call id when collapsed', () => {
      render(<MessageItem {...makeProps(makeToolCallEvent())} />);

      expect(screen.getByText('Tool call')).toBeInTheDocument();
      expect(screen.getByText('get_order')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tool call/ })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      expect(screen.queryByText('Arguments')).not.toBeInTheDocument();
    });

    it('calls onToggle with the event id when the header is clicked', () => {
      const onToggle = vi.fn();
      render(<MessageItem {...makeProps(makeToolCallEvent(), { onToggle })} />);

      fireEvent.click(screen.getByRole('button', { name: /Tool call/ }));
      expect(onToggle).toHaveBeenCalledWith('evt-2');
    });

    it('shows the arguments payload when expanded', () => {
      render(<MessageItem {...makeProps(makeToolCallEvent(), { isExpanded: true })} />);

      expect(screen.getByText('Arguments')).toBeInTheDocument();
      expect(screen.getByText(/"order_id": "o-1"/)).toBeInTheDocument();
    });

    it('switches between pretty and raw payload views', () => {
      render(<MessageItem {...makeProps(makeToolCallEvent(), { isExpanded: true })} />);

      fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
      expect(screen.getByText('{"order_id":"o-1"}')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Raw' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('tool_result events', () => {
    it('renders a successful result with duration', () => {
      render(<MessageItem {...makeProps(makeToolResultEvent())} />);
      expect(screen.getByText(/Result: Success · 87ms/)).toBeInTheDocument();
    });

    it('renders a failed result', () => {
      render(<MessageItem {...makeProps(makeToolResultEvent({ success: false }))} />);
      expect(screen.getByText(/Result: Failed · 87ms/)).toBeInTheDocument();
    });

    it('shows the result payload when expanded', () => {
      render(<MessageItem {...makeProps(makeToolResultEvent(), { isExpanded: true })} />);

      expect(screen.getByText('Result')).toBeInTheDocument();
      expect(screen.getByText(/"status": "shipped"/)).toBeInTheDocument();
    });
  });

  describe('log events', () => {
    it('renders the log message', () => {
      render(
        <MessageItem
          {...makeProps({
            type: 'log',
            level: 'info',
            message: 'Loop started',
            _id: 'evt-l',
            _timestamp: TIMESTAMP,
          } as StreamEvent)}
        />
      );

      expect(screen.getByText('Loop started')).toBeInTheDocument();
      expect(screen.queryByText('(debug)')).not.toBeInTheDocument();
    });

    it('marks debug logs', () => {
      render(
        <MessageItem
          {...makeProps({
            type: 'log',
            level: 'debug',
            message: 'Verbose details',
            _id: 'evt-l2',
            _timestamp: TIMESTAMP,
          } as StreamEvent)}
        />
      );

      expect(screen.getByText('(debug)')).toBeInTheDocument();
    });
  });

  describe('error events', () => {
    it('renders the error code and message as an alert', () => {
      render(
        <MessageItem
          {...makeProps({
            type: 'error',
            code: 'RATE_LIMIT',
            message: 'Too many requests',
            recoverable: true,
            _id: 'evt-e',
            _timestamp: TIMESTAMP,
          } as StreamEvent)}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('RATE_LIMIT')).toBeInTheDocument();
      expect(screen.getByText('Too many requests')).toBeInTheDocument();
    });
  });

  it('renders nothing for unsupported event types', () => {
    const { container } = render(
      <MessageItem
        {...makeProps({
          type: 'heartbeat',
          timestamp: '2026-02-15T12:00:00Z',
          _id: 'evt-h',
          _timestamp: TIMESTAMP,
        } as StreamEvent)}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
