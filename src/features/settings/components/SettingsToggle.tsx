import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePreferencesStore, type TogglePreference } from '../../../stores/preferences';

interface SettingsToggleProps {
  preference: TogglePreference;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => Promise<void>;
  accessory?: ReactNode;
}

/** Native checkbox behavior with acknowledged saves and persistent retry feedback. */
export function SettingsToggle({
  preference,
  label,
  description,
  checked,
  onChange,
  accessory,
}: SettingsToggleProps) {
  const id = useId();
  const labelId = `${id}-label`,
    descriptionId = `${id}-description`;
  const statusId = `${id}-status`,
    errorId = `${id}-error`;
  const save = usePreferencesStore((state) => state.saves[preference]);
  const initialized = usePreferencesStore((state) => state.initialized);
  const reload = usePreferencesStore((state) => state.reload);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRequest = useRef(checked);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const privacy = preference === 'telemetryEnabled';
  const loading = !initialized;
  const pending = save?.pending ?? false;
  const error = save?.error ?? (unexpectedError ? 'save_failed' : null);
  const blocked = !privacy && (loading || pending || error === 'load_failed');
  const request = (value: boolean, returnFocus = false) => {
    lastRequest.current = value;
    const version = ++requestVersion.current;
    setUnexpectedError(false);
    const failed = () => {
      if (mounted.current && version === requestVersion.current) setUnexpectedError(true);
    };
    const restoreFocus = () => {
      if (
        returnFocus &&
        mounted.current &&
        version === requestVersion.current &&
        document.activeElement === document.body
      )
        inputRef.current?.focus();
    };
    try {
      void Promise.resolve(onChange(value)).catch(failed).finally(restoreFocus);
    } catch {
      failed();
      restoreFocus();
    }
  };
  const message =
    error === 'load_failed'
      ? privacy
        ? 'Sharing is off for this session. Your saved preference could not be loaded.'
        : 'Your saved setting could not be loaded.'
      : privacy
        ? 'Sharing is off for this session. Your restart preference could not be saved.'
        : 'This change could not be saved. Try again.';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span id={labelId} className="block font-medium text-[var(--ui-text)]">
            {label}
          </span>
          <span id={descriptionId} className="block text-sm text-[var(--ui-muted)]">
            {description}
          </span>
          {(loading || pending) && (
            <span id={statusId} role="status" className="block text-xs text-[var(--ui-muted)]">
              {loading ? 'Loading…' : 'Saving…'}
            </span>
          )}
        </label>
        <div className="flex shrink-0 items-center gap-2">
          {accessory}
          <span className="settings-toggle">
            <input
              ref={inputRef}
              id={id}
              type="checkbox"
              className="settings-toggle-input"
              aria-labelledby={labelId}
              aria-describedby={[
                descriptionId,
                (loading || pending) && statusId,
                !loading && error && errorId,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-busy={loading || pending}
              aria-disabled={blocked}
              aria-invalid={!!error}
              checked={pending ? save!.requested : checked}
              onChange={(event) => {
                if (!blocked) request(event.target.checked);
              }}
            />
            <span className="settings-toggle-track" aria-hidden="true" />
          </span>
        </div>
      </div>
      {!loading && error && (
        <div
          id={errorId}
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-[var(--ui-negative)]"
        >
          <p>{message}</p>
          <button
            type="button"
            className="ui-button ui-button-secondary rounded-lg px-3 py-1.5 text-sm font-medium"
            aria-label={`${error === 'load_failed' ? 'Retry loading' : 'Retry saving'} ${label}`}
            onClick={() => {
              if (error === 'load_failed') {
                void reload();
              } else request(save?.requested ?? lastRequest.current, true);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
