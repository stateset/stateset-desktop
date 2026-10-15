import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { DurableChatStatus } from './durableTypes';
import { selectTimeline, type TimelineFilter, type WorkflowEvent } from './timeline';

interface Props {
  state: DurableChatStatus;
  historyTruncated?: boolean;
}
export function ExecutionTimeline(props: Props) {
  return <Timeline key={props.state.request_id} {...props} />;
}
function Timeline({ state, historyTruncated }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [visible, setVisible] = useState(50);
  const list = useRef<HTMLOListElement>(null);
  const reveal = useRef<number>();
  const events = useMemo(
    () => selectTimeline(state.events, filter, query),
    [state.events, filter, query]
  );
  useLayoutEffect(() => {
    if (reveal.current === undefined) return;
    const target = Array.from(list.current?.children ?? []).find(
      (element) => (element as HTMLElement).dataset.eventId === String(reveal.current)
    );
    if (target instanceof HTMLElement) target.focus();
    reveal.current = undefined;
  }, [visible, events]);
  return (
    <section aria-label="Execution timeline" className="chat-timeline">
      <h2 className="text-sm font-medium">Execution timeline</h2>
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-2 top-2.5 h-3.5 w-3.5" />
        <input
          type="search"
          aria-label="Search workflow events"
          placeholder="Search events…"
          value={query}
          maxLength={256}
          className="minimal-input w-full pl-7 text-xs"
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(50);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
              setVisible(50);
            }
          }}
        />
      </label>
      <select
        aria-label="Filter timeline"
        value={filter}
        className="minimal-input w-full text-xs"
        onChange={(event) => {
          setFilter(event.target.value as TimelineFilter);
          setVisible(50);
        }}
      >
        <option value="all">All events</option>
        <option value="attention">Needs attention</option>
        <option value="actions">Actions</option>
        <option value="policy">Policy and approvals</option>
        <option value="outputs">Deliverables</option>
      </select>
      <p className="chat-timeline-caption">
        {events.length} {events.length === 1 ? 'event' : 'events'} · Newest first
        {events.length > visible ? ` · Showing ${visible}` : ''}
      </p>
      {historyTruncated && (
        <p className="chat-timeline-caption">
          Some older observations are unavailable. Search covers the retained events only.
        </p>
      )}
      {!events.length && (
        <p className="chat-file-empty">
          {query.trim() || filter !== 'all'
            ? 'No events match this view. Clear search or change the filter.'
            : 'No workflow events recorded yet.'}
        </p>
      )}
      <ol ref={list} aria-label="Workflow events" className="chat-timeline-events">
        {events.slice(0, visible).map(({ event, label, summary, attention }) => (
          <li
            key={event.id}
            data-event-id={event.id}
            tabIndex={-1}
            data-tone={attention ? 'attention' : 'quiet'}
          >
            <div className="chat-timeline-event-heading">
              <h3>{label}</h3>
              <EventTime event={event} />
            </div>
            {summary && <p className="chat-timeline-summary">{summary}</p>}
            <details>
              <summary>Evidence and details</summary>
              <pre tabIndex={0} aria-label={`Evidence for event ${event.id}`}>
                {JSON.stringify(event.detail, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>
      {events.length > visible && (
        <button
          type="button"
          className="minimal-secondary-button w-full"
          onClick={() => {
            reveal.current = events[visible]?.event.id;
            setVisible((count) => count + 50);
          }}
        >
          Show earlier events ({Math.min(50, events.length - visible)})
        </button>
      )}
    </section>
  );
}
function EventTime({ event }: { event: WorkflowEvent }) {
  const date = new Date(event.at);
  if (!Number.isFinite(event.at) || Number.isNaN(date.getTime()))
    return <span className="chat-timeline-caption">Time unavailable</span>;
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()}>
      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
      {date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}
    </time>
  );
}
