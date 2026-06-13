/** @vitest-environment happy-dom */
import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationList } from './ConversationList';
import type { ConversationMessage } from '../utils';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, ...rest } = props;
  return rest;
}

const conversation: ConversationMessage[] = [
  { id: 'm1', role: 'user', content: 'Where is my order?', timestamp: 1700000000000 },
  { id: 'm2', role: 'assistant', content: 'Let me check that for you.', timestamp: 1700000001000 },
  { id: 'm3', role: 'system', content: 'Session started', timestamp: 1700000002000 },
];

describe('ConversationList', () => {
  it('renders every conversation message', () => {
    render(
      <ConversationList
        conversation={conversation}
        reduceMotion
        endRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByText('Where is my order?')).toBeInTheDocument();
    expect(screen.getByText('Let me check that for you.')).toBeInTheDocument();
    expect(screen.getByText('Session started')).toBeInTheDocument();
  });

  it('exposes the conversation as an accessible log', () => {
    render(
      <ConversationList
        conversation={conversation}
        reduceMotion
        endRef={createRef<HTMLDivElement>()}
      />
    );

    expect(screen.getByRole('log', { name: 'Voice conversation' })).toBeInTheDocument();
  });

  it('attaches the end ref for auto-scrolling', () => {
    const endRef = createRef<HTMLDivElement>();
    render(<ConversationList conversation={conversation} reduceMotion endRef={endRef} />);

    expect(endRef.current).toBeInstanceOf(HTMLDivElement);
  });
});
