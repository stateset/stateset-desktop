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
        'flex items-center justify-between gap-4 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl transition-all',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:bg-slate-800/60 hover:border-slate-600/50 shadow-sm hover:shadow-md',
        className
      )}
    >
      <div className="flex-1">
        <p className="font-medium text-gray-200">{label}</p>
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
            'w-11 h-6 rounded-full transition-colors shadow-inner',
            checked ? 'bg-brand-500' : 'bg-slate-600'
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-out',
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
  const id = `select-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl shadow-sm transition-all hover:bg-slate-800/50 hover:border-slate-600/50',
        disabled && 'opacity-50',
        className
      )}
    >
      <div className="flex-1">
        <label htmlFor={id} className="font-medium text-gray-200 cursor-pointer">
          {label}
        </label>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm font-medium text-gray-200 focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20 transition-all shadow-inner"
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
  const id = `number-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl shadow-sm transition-all hover:bg-slate-800/50 hover:border-slate-600/50',
        disabled && 'opacity-50',
        className
      )}
    >
      <div className="flex-1">
        <label htmlFor={id} className="font-medium text-gray-200 cursor-pointer">
          {label}
        </label>
        {description && <p className="text-sm text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-24 px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm font-medium text-right text-gray-200 focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20 transition-all shadow-inner"
        />
        {unit && <span className="text-sm font-medium text-gray-400">{unit}</span>}
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
    <div className={clsx('space-y-1.5', className)}>
      {label && <label className="block text-sm font-medium text-gray-300 ml-1">{label}</label>}
      <input
        ref={ref}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={clsx(
          'w-full px-3.5 py-2.5 bg-slate-900/60 border rounded-xl focus:outline-none transition-all shadow-inner',
          error
            ? 'border-rose-500/50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus-glow-error'
            : 'border-slate-700/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-slate-600/60 focus-glow'
        )}
        {...props}
      />
      {error && <p className="text-sm font-medium text-rose-400 ml-1 mt-1">{error}</p>}
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
    <div className={clsx('space-y-1.5', className)}>
      {label && <label className="block text-sm font-medium text-gray-300 ml-1">{label}</label>}
      <textarea
        ref={ref}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={clsx(
          'w-full px-3.5 py-2.5 bg-slate-900/60 border rounded-xl focus:outline-none transition-all shadow-inner resize-none',
          error
            ? 'border-rose-500/50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus-glow-error'
            : 'border-slate-700/60 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 hover:border-slate-600/60 focus-glow'
        )}
        {...props}
      />
      {error && <p className="text-sm font-medium text-rose-400 ml-1 mt-1">{error}</p>}
    </div>
  );
});
