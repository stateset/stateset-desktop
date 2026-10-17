import { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useComputerChatsStore } from './store';
import { useDurableWorkflowsStore } from '../../stores/durableWorkflows';
import { durableChatController } from './durable';
import type { ComputerChat } from './types';
import { chatEnded } from './library';
import { lastSyncDescription } from './presentation';

export function ConnectionNotice({
  chat,
  onOpenSettings,
}: {
  chat: ComputerChat;
  onOpenSettings?: () => void;
}) {
  const connection = useComputerChatsStore((s) => s.connections[chat.id]);
  const engineUrl = useDurableWorkflowsStore((s) => s.engineUrl);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [now, setNow] = useState(Date.now());
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const alive = useRef(true);
  const mismatch = chat.durableSession?.engineUrl !== engineUrl;
  const interrupted = !online || (connection && connection.status !== 'connected');
  useEffect(() => {
    alive.current = true;
    const update = () => {
      setOnline(navigator.onLine !== false);
      setNow(Date.now());
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      alive.current = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!interrupted || mismatch) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [interrupted, mismatch]);
  const retry = async () => {
    if (pending.current || !online || mismatch) return;
    pending.current = true;
    setRetrying(true);
    setError(undefined);
    try {
      await durableChatController.refresh(chat.id);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      pending.current = false;
      if (alive.current) setRetrying(false);
    }
  };
  if (!mismatch && !interrupted)
    return (
      <p role="status" className={connection?.lastSyncedAt ? 'sr-only' : 'chat-connection-status'}>
        {connection?.lastSyncedAt
          ? 'Connected'
          : chatEnded(chat)
            ? 'Saved conversation · refresh to check its latest status'
            : 'Connecting to your conversation…'}
      </p>
    );
  const seconds = Math.max(0, Math.ceil(((connection?.nextRetryAt ?? now) - now) / 1000));
  const attention = connection?.status === 'attention';
  return (
    <section aria-label="Conversation connection" className="chat-connection-notice">
      <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p role="status" aria-atomic="true" className="chat-connection-heading">
          {mismatch
            ? 'This conversation uses a different workflow connection.'
            : !online
              ? 'You’re offline. Showing saved observations.'
              : attention
                ? 'Connection needs attention. Showing saved observations.'
                : 'Reconnecting. Showing saved observations.'}
        </p>
        {mismatch ? (
          <p className="break-words">
            This conversation belongs to {chat.durableSession?.engineUrl}. Restore that connection
            in computer setup to reconnect.
          </p>
        ) : (
          connection?.message && <p className="break-words">{connection.message}</p>
        )}
        {!mismatch && (
          <p className="chat-connection-age">
            <span
              title={
                connection?.lastSyncedAt
                  ? new Date(connection.lastSyncedAt).toLocaleString()
                  : undefined
              }
            >
              {lastSyncDescription(connection?.lastSyncedAt, now)}
            </span>
            {online && !attention && seconds > 0 && (
              <span aria-hidden="true"> · Retry in {seconds}s</span>
            )}
          </p>
        )}
        <p>
          {chatEnded(chat)
            ? 'This computer has ended. Refreshing only checks its latest status.'
            : 'Your server workflow may still be running. Reconnecting only refreshes its status.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {!mismatch && (
            <button
              type="button"
              disabled={!online || retrying}
              aria-busy={retrying || undefined}
              onClick={() => void retry()}
              className="minimal-secondary-button"
            >
              <RefreshCw
                className={`h-3 w-3 ${retrying ? 'animate-spin motion-reduce:animate-none' : ''}`}
                aria-hidden="true"
              />
              {retrying ? 'Checking connection…' : 'Retry now'}
            </button>
          )}
          {onOpenSettings && (mismatch || attention) && (
            <button type="button" onClick={onOpenSettings} className="minimal-secondary-button">
              Open connection settings
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
