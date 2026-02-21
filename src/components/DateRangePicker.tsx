import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { subDays, format } from 'date-fns';
import clsx from 'clsx';

interface DateRange {
  start: Date;
  end: Date;
}

interface DateRangePreset {
  label: string;
  days: number;
}

const PRESETS: DateRangePreset[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const daysDiff = Math.round(
    (value.end.getTime() - value.start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const activePreset = PRESETS.find((p) => Math.abs(p.days - daysDiff - 1) <= 1);
  const displayLabel =
    activePreset?.label || `${format(value.start, 'MMM d')} – ${format(value.end, 'MMM d')}`;

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const selectPreset = (days: number) => {
    const end = new Date();
    const start = subDays(end, days - 1);
    onChange({ start, end });
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/90 border border-gray-700/80 rounded-lg hover:bg-gray-700/90 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        aria-expanded={isOpen}
        aria-label="Open date range picker"
      >
        <Calendar className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <span>{displayLabel}</span>
        <ChevronDown
          className={clsx('w-3.5 h-3.5 text-gray-500 transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-48 bg-slate-900/95 border border-slate-700/60 rounded-xl shadow-2xl backdrop-blur-xl z-50 py-1.5 animate-scale-in"
          role="listbox"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => selectPreset(preset.days)}
              className={clsx(
                'w-full px-4 py-2 text-left text-sm mx-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                activePreset?.days === preset.days
                  ? 'text-brand-400 bg-slate-800/60 border-l-2 border-l-brand-400'
                  : 'hover:bg-slate-800/40 border-l-2 border-l-transparent'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
