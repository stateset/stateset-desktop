import clsx from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Color class for the visible arc, e.g. "border-t-emerald-400" */
  color?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-[2.5px]',
};

export function Spinner({ size = 'md', color = 'border-t-white', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'rounded-full animate-spin border-current/30',
        color,
        sizeMap[size],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
