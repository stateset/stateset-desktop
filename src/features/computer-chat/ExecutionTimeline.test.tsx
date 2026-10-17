/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionTimeline } from './ExecutionTimeline';
import type { DurableChatStatus } from './durableTypes';
import type { WorkflowEvent } from './timeline';
afterEach(cleanup);
function state(count = 120): DurableChatStatus {
  return {
    request_id: 'chat',
    events: Array.from({ length: count }, (_, i) => ({
      id: i,
      kind: 'action_started',
      at: 1700000000000 + i,
      detail: { name: 'execute', request_id: `request-${i}` },
    })),
  } as DurableChatStatus;
}
const rows = () =>
  within(screen.getByRole('list', { name: 'Workflow events' })).queryAllByRole('listitem');
describe('workflow timeline reading', () => {
  it('renders the newest fifty and focuses the first newly revealed event when loading earlier ones', () => {
    render(<ExecutionTimeline state={state()} />);
    expect(rows()).toHaveLength(50);
    expect(rows()[0]).toHaveAttribute('data-event-id', '119');
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier events (50)' }));
    expect(rows()).toHaveLength(100);
    expect(rows()[50]).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier events (20)' }));
    expect(rows()).toHaveLength(120);
    expect(rows()[100]).toHaveFocus();
  });
  it('searches an older event beyond the rendered window and clears search with Escape', () => {
    render(<ExecutionTimeline state={state()} />);
    const search = screen.getByRole('searchbox', { name: 'Search workflow events' });
    fireEvent.change(search, { target: { value: 'request-0' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute('data-event-id', '0');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(rows()).toHaveLength(50);
  });
  it('leaves IME composition untouched when Escape is pressed', () => {
    render(<ExecutionTimeline state={state()} />);
    const search = screen.getByRole('searchbox', { name: 'Search workflow events' });
    fireEvent.change(search, { target: { value: 'request' } });
    fireEvent.keyDown(search, { key: 'Escape', isComposing: true });
    expect(search).toHaveValue('request');
  });
  it('filters attention events using recorded decisions and preserves the source evidence', () => {
    const value = state(0);
    value.events = [
      {
        id: 1,
        kind: 'policy_evaluated',
        at: 1,
        detail: { phase: 'verification', verdict: 'deny', evidence_ids: ['receipt-one'] },
      },
      { id: 2, kind: 'action_completed', at: 2, detail: { name: 'execute', exit_code: 0 } },
    ];
    render(<ExecutionTimeline state={value} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter timeline' }), {
      target: { value: 'attention' },
    });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Output policy · Denied')).toBeInTheDocument();
    expect(screen.getByLabelText('Evidence for event 1')).toHaveTextContent('receipt-one');
  });
  it('keeps the same chat’s view on refresh and resets it for another conversation', () => {
    const first = state();
    const { rerender } = render(<ExecutionTimeline state={first} />);
    const search = screen.getByRole('searchbox', { name: 'Search workflow events' });
    fireEvent.change(search, { target: { value: 'request-5' } });
    rerender(<ExecutionTimeline state={{ ...first, events: [...first.events] }} />);
    expect(search).toHaveValue('request-5');
    rerender(<ExecutionTimeline state={{ ...first, request_id: 'other' }} />);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(rows()).toHaveLength(50);
  });
  it('distinguishes missing history from no matches and handles invalid dates and unknown details', () => {
    const value = state(0);
    value.events = [
      {
        id: 1,
        kind: 'new_worker_event',
        at: Infinity,
        detail: { message: '<img src=x onerror=alert(1)>' },
      } as WorkflowEvent,
    ];
    const { container } = render(<ExecutionTimeline state={value} historyTruncated />);
    expect(screen.getByText(/Some older observations are unavailable/)).toBeInTheDocument();
    expect(screen.getByText('Time unavailable')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'new worker event' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByLabelText('Evidence for event 1')).toHaveTextContent('<img');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-such-event' } });
    expect(screen.getByText(/No events match this view/)).toBeInTheDocument();
  });
});
