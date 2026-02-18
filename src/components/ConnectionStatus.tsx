import { memo } from 'react';
import { Wifi, WifiOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export type ConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

interface ConnectionStatusProps {
  state: ConnectionState;
  /** Optional custom message */
  message?: string;
  /** Show as a compact indicator */
  compact?: boolean;
  /** Additional class name */
  className?: string;
  /** Show reconnection attempt count */
  reconnectAttempt?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

const STATE_CONFIG: Record<
  ConnectionState,
  {
    icon: typeof Wifi;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    animate?: boolean;
  }
> = {
  connected: {
    icon: CheckCircle,
    color: 'text-green-400',
    bgColor: 'bg-green-900/30',
    borderColor: 'border-green-500/30',
    label: 'Connected',
  },
  connecting: {
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30',
    borderColor: 'border-blue-500/30',
    label: 'Connecting',
    animate: true,
  },
  disconnected: {
    icon: WifiOff,
    color: 'text-gray-400',
    bgColor: 'bg-gray-800/50',
    borderColor: 'border-gray-600/30',
    label: 'Disconnected',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-500/30',
    label: 'Connection Error',
  },
  reconnecting: {
    icon: Loader2,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-500/30',
    label: 'Reconnecting',
    animate: true,
  },
};

export const ConnectionStatus = memo(function ConnectionStatus({
  state,
  message,
  compact = false,
  className,
  reconnectAttempt,
  maxReconnectAttempts,
}: ConnectionStatusProps) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  const displayMessage =
    message ||
    (state === 'reconnecting' && reconnectAttempt !== undefined
      ? `Reconnecting${maxReconnectAttempts ? ` (${reconnectAttempt}/${maxReconnectAttempts})` : `...`}`
      : config.label);

  if (compact) {
    return (
      <div className={clsx('flex items-center gap-1.5', className)} title={displayMessage}>
        <span className="relative flex h-2 w-2">
          {(state === 'connected' || state === 'connecting' || state === 'reconnecting') && (
            <span
              className={clsx(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                state === 'connected' && 'bg-green-400 animate-ping',
                (state === 'connecting' || state === 'reconnecting') && 'bg-blue-400 animate-pulse'
              )}
            />
          )}
          <span
            className={clsx(
              'relative inline-flex h-2 w-2 rounded-full',
              state === 'connected' && 'bg-green-500',
              state === 'connecting' && 'bg-blue-500',
              state === 'disconnected' && 'bg-gray-500',
              state === 'error' && 'bg-red-500',
              state === 'reconnecting' && 'bg-amber-500'
            )}
          />
        </span>
        <span className={clsx('text-xs', config.color)}>{displayMessage}</span>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg border',
          config.bgColor,
          config.borderColor,
          className
        )}
      >
        <Icon className={clsx('h-4 w-4', config.color, config.animate && 'animate-spin')} />
        <span className={clsx('text-sm font-medium', config.color)}>{displayMessage}</span>
      </motion.div>
    </AnimatePresence>
  );
});

/**
 * Minimal dot indicator for tight spaces
 */
export const ConnectionDot = memo(function ConnectionDot({
  state,
  size = 'md',
  className,
}: {
  state: ConnectionState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
  };

  const colorClasses = {
    connected: 'bg-green-500',
    connecting: 'bg-blue-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
    reconnecting: 'bg-amber-500',
  };

  const shouldPulse = state === 'connected' || state === 'connecting' || state === 'reconnecting';

  return (
    <span
      className={clsx('relative flex', sizeClasses[size], className)}
      title={STATE_CONFIG[state].label}
    >
      {shouldPulse && (
        <span
          className={clsx(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            colorClasses[state]
          )}
        />
      )}
      <span
        className={clsx(
          'relative inline-flex rounded-full',
          sizeClasses[size],
          colorClasses[state]
        )}
      />
    </span>
  );
});

// Note: getConnectionState helper moved to a separate utility if needed
// Usage: import { getConnectionState } from '../lib/connectionUtils'
