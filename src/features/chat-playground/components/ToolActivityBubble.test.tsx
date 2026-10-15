/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolActivityBubble } from './ToolActivityBubble';
import type { ChatMessage, ChatToolActivity } from '../../../types';

function makeMessage(tool: Partial<ChatToolActivity> = {}): ChatMessage {
  return {
    id: 'tool-1',
    role: 'tool',
    content: 'list_orders',
    timestamp: Date.parse('2026-09-20T10:00:00Z'),
    tool: { name: 'list_orders', status: 'running', ...tool },
  };
}

describe('ToolActivityBubble', () => {
  it('names the running tool', () => {
    render(<ToolActivityBubble message={makeMessage()} />);

    expect(screen.getByText('list_orders')).toBeInTheDocument();
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('shows the duration once the tool succeeds', () => {
    render(<ToolActivityBubble message={makeMessage({ status: 'success', durationMs: 128 })} />);

    expect(screen.getByText('128ms')).toBeInTheDocument();
    expect(screen.queryByText('Running…')).not.toBeInTheDocument();
  });

  it('marks a failed tool call', () => {
    render(<ToolActivityBubble message={makeMessage({ status: 'error', durationMs: 20 })} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('hides arguments and result behind a toggle', () => {
    render(
      <ToolActivityBubble
        message={makeMessage({
          status: 'success',
          arguments: { limit: 5 },
          resultPreview: '{"orders":[]}',
        })}
      />
    );

    expect(screen.queryByText(/"limit": 5/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /details for list_orders/i }));

    expect(screen.getByText(/"limit": 5/)).toBeInTheDocument();
    expect(screen.getByText('{"orders":[]}')).toBeInTheDocument();
  });

  it('offers no toggle when there is nothing to show', () => {
    render(<ToolActivityBubble message={makeMessage()} />);

    expect(screen.queryByRole('button', { name: /details/i })).not.toBeInTheDocument();
  });

  it('falls back to the message content when the tool payload is missing', () => {
    const message = { ...makeMessage(), tool: undefined };
    render(<ToolActivityBubble message={message} />);

    expect(screen.getByText('list_orders')).toBeInTheDocument();
  });
});
