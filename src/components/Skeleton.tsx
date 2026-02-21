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
    !shimmer && 'bg-slate-800/60',
    shimmer && 'bg-slate-800/40',
    animate && !shimmer && 'animate-pulse',
    variant === 'circular' && 'rounded-full',
    variant === 'rectangular' && 'rounded-xl',
    variant === 'text' && 'rounded-md',
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
          className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-slate-600/30 via-50% to-transparent"
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
    <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm">
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2.5">
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={16} />
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <Skeleton width={80} height={36} variant="rectangular" />
        <Skeleton width={80} height={36} variant="rectangular" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 bg-slate-900/40 border border-slate-700/30 rounded-xl backdrop-blur-sm animate-fade-in"
          style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
        >
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
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-4">
        <Skeleton variant="rectangular" width={48} height={48} />
        <div className="space-y-2.5">
          <Skeleton width={60} height={24} />
          <Skeleton width={80} height={14} />
        </div>
      </div>
    </div>
  );
}
