import { memo, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animate?: boolean;
  /** Use shimmer animation instead of pulse */
  shimmer?: boolean;
}

export const Skeleton = memo(function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animate = true,
  shimmer = false,
}: SkeletonProps) {
  const baseClasses = clsx(
    'relative overflow-hidden',
    !shimmer && 'bg-gray-800',
    shimmer && 'bg-gray-800/50',
    animate && !shimmer && 'animate-pulse',
    variant === 'circular' && 'rounded-full',
    variant === 'rectangular' && 'rounded-lg',
    variant === 'text' && 'rounded',
    className
  );

  const style: CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'text' ? '1em' : undefined),
  };

  return (
    <div className={baseClasses} style={style} aria-hidden="true">
      {shimmer && animate && (
        <div
          className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-gray-700/50 to-transparent"
          style={{ animationTimingFunction: 'ease-in-out' }}
        />
      )}
    </div>
  );
});

/**
 * Wrapper that shows skeleton during loading, content when loaded
 */
export function SkeletonLoader({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return loading ? <>{skeleton}</> : <>{children}</>;
}

export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={16} />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton width={80} height={32} variant="rectangular" />
        <Skeleton width={80} height={32} variant="rectangular" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 bg-gray-900 rounded-lg">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton width="30%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="15%" height={16} />
          <div className="ml-auto">
            <Skeleton width={60} height={24} variant="rectangular" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetric() {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="rectangular" width={40} height={40} />
        <div className="space-y-2">
          <Skeleton width={60} height={24} />
          <Skeleton width={80} height={14} />
        </div>
      </div>
    </div>
  );
}
