import clsx from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Color class for the visible arc, e.g. "border-t-emerald-400" */
  color?: string;
  /** When true, the spinner stops animating */
  paused?: boolean;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-[2.5px]',
};

export function Spinner({
  size = 'md',
  color = 'border-t-white',
  className,
  paused,
}: SpinnerProps) {
  return (
    <div
      className={clsx(
        'rounded-full border-current/30',
        !paused && 'animate-spin',
        color,
        sizeMap[size],
        className
      )}
      role="status"
      aria-label={paused ? 'Paused' : 'Loading'}
    >
      <span className="sr-only">{paused ? 'Paused' : 'Loading...'}</span>
    </div>
  );
}
