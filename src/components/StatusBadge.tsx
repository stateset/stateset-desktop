import { memo } from 'react';
import { AlertTriangle, Loader2, Pause, Play, Square, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { AgentSessionStatus } from '../types';
import { getStatusBadgeClasses, getStatusText, getStatusDotColor } from '../lib/statusUtils';

interface StatusBadgeProps {
  status: AgentSessionStatus;
  /** Show status icon */
  showIcon?: boolean;
  /** Show animated pulse for running status */
  showPulse?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const STATUS_ICONS: Record<AgentSessionStatus, React.ElementType> = {
  starting: Zap,
  running: Play,
  paused: Pause,
  stopping: Square,
  stopped: Square,
  failed: AlertTriangle,
};

/**
 * Unified status badge component for displaying agent status
 * Uses consistent styling from statusUtils
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  showIcon = false,
  showPulse = true,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  const isActive = status === 'running' || status === 'starting';
  const isLoading = status === 'starting' || status === 'stopping';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-sm',
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  };

  return (
    <span
      role="status"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        sizeClasses[size],
        getStatusBadgeClasses(status),
        className
      )}
    >
      {showIcon &&
        (isLoading ? (
          <Loader2 className={clsx(iconSizeClasses[size], 'animate-spin')} />
        ) : (
          <Icon className={iconSizeClasses[size]} />
        ))}
      <span>{getStatusText(status)}</span>
      {showPulse && isActive && !isLoading && (
        <span className="relative flex h-2 w-2">
          <span
            className={clsx(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              getStatusDotColor(status)
            )}
          />
          <span
            className={clsx('relative inline-flex rounded-full h-2 w-2', getStatusDotColor(status))}
          />
        </span>
      )}
    </span>
  );
});

interface StatusDotProps {
  status: AgentSessionStatus;
  /** Show animated pulse for active status */
  showPulse?: boolean;
  /** Size in pixels */
  size?: number;
  /** Additional className */
  className?: string;
}

/**
 * Simple status indicator dot
 */
export const StatusDot = memo(function StatusDot({
  status,
  showPulse = true,
  size = 10,
  className,
}: StatusDotProps) {
  const isActive = status === 'running' || status === 'starting';

  return (
    <span
      className={clsx('relative inline-flex', className)}
      style={{ width: size, height: size }}
      title={getStatusText(status)}
      aria-label={`Status: ${getStatusText(status)}`}
    >
      {showPulse && isActive && (
        <span
          className={clsx(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            getStatusDotColor(status)
          )}
        />
      )}
      <span
        className={clsx('relative inline-flex rounded-full', getStatusDotColor(status))}
        style={{ width: size, height: size }}
      />
    </span>
  );
});
