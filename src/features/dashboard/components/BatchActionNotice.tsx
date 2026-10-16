import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { describeBatchResult, type BatchProgress, type BatchResult } from '../utils/sessionActions';

interface BatchActionNoticeProps {
  progress: BatchProgress | null;
  result: BatchResult | null;
  isBusy: boolean;
  previousWorkspace?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Persistent outcomes keep failed agents reviewable after the toast disappears. */
export function BatchActionNotice({
  progress,
  result,
  isBusy,
  previousWorkspace = false,
  onRetry,
  onDismiss,
}: BatchActionNoticeProps) {
  if (isBusy && previousWorkspace)
    return (
      <section className="dashboard-action-notice border-b px-5 py-3" role="status">
        Finishing the previous workspace action…
      </section>
    );
  if (!progress && !result) return null;
  if (progress) {
    const label = { start: 'Starting agents', stop: 'Stopping agents', delete: 'Deleting agents' }[
      progress.action
    ];
    return (
      <section
        className="dashboard-action-notice border-b px-5 py-3"
        aria-label="Agent action progress"
      >
        <p className="text-sm font-medium" role="status">
          {progress.completed === progress.total ? 'Refreshing agent list…' : label}
          <span className="dashboard-stat-caption ml-2">
            {progress.completed} of {progress.total} processed
          </span>
        </p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          className="dashboard-action-track h-1 rounded-full overflow-hidden mt-2"
        >
          <div
            className="dashboard-action-fill h-full"
            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
          />
        </div>
      </section>
    );
  }
  if (!result) return null;
  const incomplete = result.failed.length > 0 || result.skipped > 0;
  const Icon = incomplete ? AlertCircle : CheckCircle2;
  return (
    <section
      className="dashboard-action-notice border-b px-5 py-3"
      aria-label="Agent action result"
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={`w-4 h-4 mt-0.5 shrink-0 ${incomplete ? 'ui-warning' : 'ui-positive'}`}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm">{describeBatchResult(result)}</p>
          {result.failed.length > 0 && (
            <details className="mt-2 text-xs dashboard-stat-caption">
              <summary className="cursor-pointer w-fit">
                {result.failed.length} failed agent{result.failed.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1" aria-label="Failed agents">
                {result.failed.slice(0, 10).map((agent) => (
                  <li key={agent.id} className="break-words">
                    {agent.name || agent.id}
                  </li>
                ))}
                {result.failed.length > 10 && <li>And {result.failed.length - 10} more</li>}
              </ul>
            </details>
          )}
        </div>
        {result.failed.length > 0 && (
          <button
            type="button"
            className="ui-button ui-button-secondary px-2.5 py-1.5 text-xs rounded-lg"
            disabled={isBusy}
            onClick={onRetry}
          >
            {result.action === 'delete' ? 'Review cleanup' : 'Retry failed'}
          </button>
        )}
        <button
          type="button"
          className="ui-button ui-button-ghost p-1.5 rounded-lg"
          disabled={isBusy}
          onClick={onDismiss}
          aria-label="Dismiss action result"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
