import { Activity, AlertCircle, Check, Loader2, Radio, RotateCw, X } from 'lucide-react';
import { useDurableWorkflowEvents } from '../hooks/useDurableWorkflowEvents';
import type { DurableWorkflowEvent } from '../lib/durableWorkflows';

function eventLabel(event: DurableWorkflowEvent): string {
  const activity = event.activity ? ` · ${event.activity}` : '';
  const signal = event.signal ? ` · ${event.signal}` : '';
  return `${event.kind.replace(/_/g, ' ')}${activity}${signal}`;
}

function eventIcon(event: DurableWorkflowEvent) {
  if (event.kind.includes('failed') || event.kind.includes('timed_out')) {
    return <X className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />;
  }
  if (event.kind.includes('completed')) {
    return <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />;
  }
  return <Activity className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />;
}

function eventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function DurableWorkflowActivity({
  tenantId,
  workflowId,
}: {
  tenantId: string;
  workflowId: string;
}) {
  const { events, streamState, error, retry } = useDurableWorkflowEvents(tenantId, workflowId);
  const visibleEvents = events.slice(-12);

  return (
    <section className="mt-4 border-t border-slate-800 pt-3" aria-label="Live workflow activity">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-slate-300">Activity</p>
        {streamState === 'live' ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <Radio className="h-3 w-3" aria-hidden="true" /> Live
          </span>
        ) : streamState === 'closed' ? (
          <span className="text-[10px] text-slate-500">Complete</span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {streamState === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
          </span>
        )}
        {error && (
          <button
            type="button"
            onClick={retry}
            className="ml-auto flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-200"
            title={error}
          >
            <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry now
          </button>
        )}
      </div>

      {visibleEvents.length === 0 ? (
        <p className="mt-3 text-xs text-slate-600">
          {error ? 'Activity is temporarily unavailable.' : 'Waiting for workflow events…'}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {visibleEvents.map((event, index) => (
            <li
              key={`${event.ts}-${event.event_id}-${index}`}
              className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 text-xs"
            >
              <span className="mt-0.5">{eventIcon(event)}</span>
              <div className="min-w-0">
                <p className="truncate capitalize text-slate-400" title={eventLabel(event)}>
                  {eventLabel(event)}
                </p>
                {(event.error || event.preview) && (
                  <p className="mt-1 line-clamp-2 break-all font-mono text-[10px] text-slate-600">
                    {event.error || event.preview}
                  </p>
                )}
              </div>
              <time className="font-mono text-[10px] text-slate-600" dateTime={event.ts}>
                {eventTime(event.ts)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {events.length > visibleEvents.length && (
        <p className="mt-2 text-[10px] text-slate-600">
          Showing the latest {visibleEvents.length} of {events.length} events
        </p>
      )}
      {error && visibleEvents.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-rose-400/80">
          <AlertCircle className="h-3 w-3" aria-hidden="true" /> {error}
        </p>
      )}
    </section>
  );
}
