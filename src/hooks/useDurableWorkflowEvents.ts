import { useCallback, useEffect, useState } from 'react';
import { durableWorkflowApi, type DurableWorkflowEvent } from '../lib/durableWorkflows';

const MAX_EVENTS = 100;
const FINAL_EVENT_KINDS = new Set([
  'workflow_completed',
  'workflow_failed',
  'workflow_canceled',
  'workflow_terminated',
  'workflow_timed_out',
]);

export type DurableWorkflowEventStreamState = 'connecting' | 'live' | 'reconnecting' | 'closed';

function reconnectDelay(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timeoutId = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
  });
}

export function useDurableWorkflowEvents(tenantId: string, workflowId: string) {
  const [events, setEvents] = useState<DurableWorkflowEvent[]>([]);
  const [streamState, setStreamState] = useState<DurableWorkflowEventStreamState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let lastEventId = 0;
    let finalEventReceived = false;
    let retryDelay = 1_000;

    const connect = async () => {
      setStreamState('connecting');
      setError(null);
      while (!controller.signal.aborted && !finalEventReceived) {
        try {
          await durableWorkflowApi.streamEvents(tenantId, workflowId, {
            signal: controller.signal,
            lastEventId,
            onEvent: (event) => {
              if (event.kind === 'workflow_continued_as_new') {
                lastEventId = 0;
              } else {
                lastEventId = Math.max(lastEventId, event.event_id);
              }
              finalEventReceived = FINAL_EVENT_KINDS.has(event.kind);
              retryDelay = 1_000;
              setError(null);
              setStreamState(finalEventReceived ? 'closed' : 'live');
              setEvents((current) => {
                const previous = current[current.length - 1];
                if (
                  previous?.event_id === event.event_id &&
                  previous.kind === event.kind &&
                  previous.ts === event.ts
                ) {
                  return current;
                }
                return [...current, event].slice(-MAX_EVENTS);
              });
            },
          });
          if (finalEventReceived || controller.signal.aborted) return;
        } catch (streamError) {
          if (controller.signal.aborted) return;
          setError(streamError instanceof Error ? streamError.message : String(streamError));
        }

        setStreamState('reconnecting');
        await reconnectDelay(controller.signal, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    };

    void connect();
    return () => controller.abort();
  }, [retryToken, tenantId, workflowId]);

  return { events, streamState, error, retry };
}
