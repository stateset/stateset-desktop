import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

interface SessionDataNoticeProps {
  hasData: boolean;
  isOnline: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

/** Keep unavailable and saved data visibly distinct from a genuinely empty fleet. */
export function SessionDataNotice({
  hasData,
  isOnline,
  isFetching,
  onRetry,
}: SessionDataNoticeProps) {
  const Icon = isOnline ? AlertCircle : WifiOff;
  const isRetrying = isOnline && isFetching;
  const title = !isOnline
    ? hasData
      ? 'Viewing saved agents'
      : 'Agent data unavailable offline'
    : hasData
      ? 'Couldn’t refresh agents'
      : 'Couldn’t load agents';
  const description = hasData
    ? 'Showing saved agent data. Statuses and metrics may be out of date.'
    : isOnline
      ? 'Check your connection and try again. Your agents have not been changed.'
      : 'Reconnect to load your agents. No saved data is available for this workspace.';

  return (
    <div
      className="dashboard-data-notice rounded-xl border p-5 mb-6 flex items-start gap-3"
      role={isOnline ? 'alert' : 'status'}
    >
      <Icon className="w-5 h-5 shrink-0 ui-warning mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="dashboard-stat-caption text-sm mt-1">{description}</p>
      </div>
      <button
        type="button"
        className="ui-button ui-button-secondary px-3 py-2 rounded-lg text-sm flex items-center gap-2 shrink-0"
        disabled={!isOnline || isFetching}
        onClick={onRetry}
      >
        <RefreshCw
          className={`w-4 h-4 ${isRetrying ? 'animate-spin motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        />
        {isRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
