import { useState } from 'react';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';

/** Failed local hydration is recoverable; it must never imply an empty workspace. */
export function WorkflowInitializationNotice() {
  const initialized = useDurableWorkflowsStore((state) => state.initialized);
  const error = useDurableWorkflowsStore((state) => state.initializationError);
  const initialize = useDurableWorkflowsStore((state) => state.initialize);
  const [retrying, setRetrying] = useState(false);
  if (initialized) return null;
  if (!error)
    return (
      <p role="status" className="text-sm text-[var(--ui-muted)]">
        Loading saved workflow settings…
      </p>
    );
  return (
    <section
      aria-label="Saved workflow settings"
      className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm text-[var(--ui-text)]"
    >
      <p role="alert">{error}</p>
      <p className="mt-1 text-xs text-[var(--ui-muted)]">
        Your server workflows continue independently.
      </p>
      <button
        type="button"
        disabled={retrying}
        aria-busy={retrying || undefined}
        className="minimal-secondary-button mt-2"
        onClick={() => {
          if (retrying) return;
          setRetrying(true);
          void initialize()
            .catch(() => undefined)
            .finally(() => setRetrying(false));
        }}
      >
        {retrying ? 'Retrying…' : 'Retry loading settings'}
      </button>
    </section>
  );
}
