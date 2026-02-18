import { memo, type ReactNode, type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface FormSectionProps {
  /** Section title */
  title: string;
  /** Optional description */
  description?: string;
  /** Section content */
  children: ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * Reusable form section with title and description
 */
export const FormSection = memo(function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={clsx('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
});

interface ToggleSettingProps {
  /** Setting label */
  label: string;
  /** Setting description */
  description?: string;
  /** Current toggle state */
  checked: boolean;
  /** Change handler */
  onChange: (checked: boolean) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Reusable toggle setting with label and description
 */
export const ToggleSetting = memo(function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  className,
}: ToggleSettingProps) {
  const id = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <label
      htmlFor={id}
      className={clsx(
        'flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-lg transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-800',
        className
      )}
    >
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="relative">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={clsx(
            'w-11 h-6 rounded-full transition-colors',
            checked ? 'bg-brand-600' : 'bg-gray-600'
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              checked && 'translate-x-5'
            )}
          />
        </div>
      </div>
    </label>
  );
});

interface SelectSettingProps {
  /** Setting label */
  label: string;
  /** Setting description */
  description?: string;
  /** Current value */
  value: string;
  /** Available options */
  options: { value: string; label: string }[];
  /** Change handler */
  onChange: (value: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Reusable select setting with label and description
 */
export const SelectSetting = memo(function SelectSetting({
  label,
  description,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SelectSettingProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-lg',
        disabled && 'opacity-50',
        className
      )}
    >
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-brand-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});

interface NumberSettingProps {
  /** Setting label */
  label: string;
  /** Setting description */
  description?: string;
  /** Current value */
  value: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step value */
  step?: number;
  /** Unit label (e.g., "ms", "seconds") */
  unit?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Reusable number input setting with label and description
 */
export const NumberSetting = memo(function NumberSetting({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  className,
}: NumberSettingProps) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-lg',
        disabled && 'opacity-50',
        className
      )}
    >
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-24 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-right focus:outline-none focus:border-brand-500"
        />
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
    </div>
  );
});

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Input label */
  label?: string;
  /** Error message */
  error?: string;
  /** Change handler with string value */
  onChange?: (value: string) => void;
}

/**
 * Styled text input with label and error state
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, onChange, className, ...props },
  ref
) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && <label className="block text-sm text-gray-400">{label}</label>}
      <input
        ref={ref}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={clsx(
          'w-full px-3 py-2 bg-gray-800 border rounded-lg focus:outline-none transition-colors',
          error ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-brand-500'
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
});

interface TextAreaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange'
> {
  /** Input label */
  label?: string;
  /** Error message */
  error?: string;
  /** Change handler with string value */
  onChange?: (value: string) => void;
}

/**
 * Styled textarea with label and error state
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, onChange, className, ...props },
  ref
) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && <label className="block text-sm text-gray-400">{label}</label>}
      <textarea
        ref={ref}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={clsx(
          'w-full px-3 py-2 bg-gray-800 border rounded-lg focus:outline-none transition-colors resize-none',
          error ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-brand-500'
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
});
