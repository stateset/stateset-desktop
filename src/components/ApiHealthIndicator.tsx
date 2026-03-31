import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { getApiHealth } from '../lib/api';
import type { CircuitBreakerStatus } from '../lib/circuit-breaker';

export function ApiHealthIndicator() {
  const [status, setStatus] = useState<CircuitBreakerStatus | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const checkStatus = useCallback(() => {
    setStatus(getApiHealth());
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (!status) return null;

  const getStatusConfig = () => {
    switch (status.state) {
      case 'CLOSED':
        return {
          icon: CheckCircle,
          color: 'text-green-400',
          bg: 'bg-green-900/30',
          dot: 'bg-green-400',
          label: 'Healthy',
          description: 'API is responding normally.',
        };
      case 'OPEN':
        return {
          icon: AlertCircle,
          color: 'text-red-400',
          bg: 'bg-red-900/30',
          dot: 'bg-red-400',
          label: 'Service Unavailable',
          description: `Circuit breaker open after ${status.consecutiveFailures} consecutive failures. Requests are being blocked to prevent overload.`,
        };
      case 'HALF_OPEN':
        return {
          icon: Clock,
          color: 'text-amber-400',
          bg: 'bg-amber-900/30',
          dot: 'bg-amber-400',
          label: 'Recovering',
          description: 'Testing if the API is back. Next request will determine status.',
        };
      default:
        return {
          icon: Activity,
          color: 'text-gray-400',
          bg: 'bg-gray-800',
          dot: 'bg-gray-400',
          label: 'Unknown',
          description: 'Unable to determine API status.',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  // Only show if there's an issue
  if (status.state === 'CLOSED' && status.consecutiveFailures === 0) {
    return null;
  }

  const handleRetry = () => {
    setIsRetrying(true);
    // Force a re-check after a short delay to let any pending request resolve
    setTimeout(() => {
      checkStatus();
      setIsRetrying(false);
    }, 1000);
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs no-drag cursor-default',
        config.bg
      )}
      title={config.description}
    >
      <span
        className={clsx(
          'w-2 h-2 rounded-full flex-shrink-0',
          config.dot,
          status.state === 'OPEN' && 'animate-pulse'
        )}
      />
      <Icon className={clsx('w-3.5 h-3.5', config.color)} aria-hidden="true" />
      <span className={config.color}>{config.label}</span>
      {status.consecutiveFailures > 0 && (
        <span className="text-gray-500">
          ({status.consecutiveFailures} {status.consecutiveFailures === 1 ? 'error' : 'errors'})
        </span>
      )}
      {status.state === 'OPEN' && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          title="Retry connection"
          aria-label="Retry API connection"
        >
          <RefreshCw
            className={clsx('w-3 h-3 text-gray-400', isRetrying && 'animate-spin')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
