import { useId, type ReactNode } from 'react';

interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessory?: ReactNode;
}

/** Native checkbox behavior with one consistent, theme-aware visual track. */
export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  accessory,
}: SettingsToggleProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span id={labelId} className="block font-medium text-[var(--ui-text)]">
          {label}
        </span>
        <span id={descriptionId} className="block text-sm text-[var(--ui-muted)]">
          {description}
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {accessory}
        <span className="settings-toggle">
          <input
            id={id}
            type="checkbox"
            className="settings-toggle-input"
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="settings-toggle-track" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
