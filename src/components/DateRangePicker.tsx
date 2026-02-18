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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors text-sm"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span>{displayLabel}</span>
        <ChevronDown
          className={clsx('w-3.5 h-3.5 text-gray-500 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 py-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              onClick={() => selectPreset(preset.days)}
              className={clsx(
                'w-full px-4 py-2 text-left text-sm hover:bg-gray-800 transition-colors',
                activePreset?.days === preset.days && 'text-brand-400 bg-gray-800/50'
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
