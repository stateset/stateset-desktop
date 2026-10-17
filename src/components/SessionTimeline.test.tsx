/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SessionTimeline,
  CompactTimeline,
  createTimelineEvent,
  type TimelineEvent,
} from './SessionTimeline';

// Mock framer-motion to render children without animation
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>): JSX.Element => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const { initial: _, animate: _a, exit: _e, transition: _t, className, ...rest } = props;
  return { className: className as string, ...rest };
}

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    type: 'started',
    timestamp: Date.now() - 60_000,
    title: 'Agent started',
    ...overrides,
  };
}

describe('SessionTimeline', () => {
  it('shows an empty state when there are no events', () => {
    render(<SessionTimeline events={[]} />);
    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders events as an accessible list, newest first', () => {
    const now = Date.now();
    render(
      <SessionTimeline
        events={[
          makeEvent({ id: 'a', title: 'Oldest event', timestamp: now - 120_000 }),
          makeEvent({ id: 'b', title: 'Newest event', timestamp: now - 10_000 }),
          makeEvent({ id: 'c', title: 'Middle event', timestamp: now - 60_000 }),
        ]}
      />
    );

    const list = screen.getByRole('list', { name: 'Session timeline' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Newest event');
    expect(items[1]).toHaveTextContent('Middle event');
    expect(items[2]).toHaveTextContent('Oldest event');
  });

  it('limits visible events and shows a remainder indicator', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `Event ${i}` })
    );
    render(<SessionTimeline events={events} maxVisible={3} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('+2 more events')).toBeInTheDocument();
  });

  it('renders description and metadata badges', () => {
    render(
      <SessionTimeline
        events={[
          makeEvent({
            type: 'tool_call',
            title: 'Called tool',
            description: 'shopify.get_order',
            metadata: { duration: '120ms' },
          }),
        ]}
      />
    );

    expect(screen.getByText('shopify.get_order')).toBeInTheDocument();
    expect(screen.getByText('duration:')).toBeInTheDocument();
    expect(screen.getByText(/120ms/)).toBeInTheDocument();
  });

  it('shows relative time by default and absolute time when disabled', () => {
    const events = [makeEvent({ timestamp: Date.now() - 60_000 })];
    const { rerender } = render(<SessionTimeline events={events} />);
    expect(screen.getByText(/ago/)).toBeInTheDocument();

    rerender(<SessionTimeline events={events} showRelativeTime={false} />);
    expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
  });
});

describe('CompactTimeline', () => {
  it('renders nothing when there are no events', () => {
    const { container } = render(<CompactTimeline events={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a capped list of recent events', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `Event ${i}` })
    );
    render(<CompactTimeline events={events} />);

    const list = screen.getByRole('list', { name: 'Recent events' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('createTimelineEvent', () => {
  it('creates an event with the given fields and a generated id/timestamp', () => {
    const before = Date.now();
    const event = createTimelineEvent('tool_call', 'Called tool', 'details', { foo: 'bar' });

    expect(event.type).toBe('tool_call');
    expect(event.title).toBe('Called tool');
    expect(event.description).toBe('details');
    expect(event.metadata).toEqual({ foo: 'bar' });
    expect(event.id).toMatch(/^event-/);
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('generates unique ids', () => {
    const a = createTimelineEvent('started', 'A');
    const b = createTimelineEvent('started', 'B');
    expect(a.id).not.toBe(b.id);
  });
});
