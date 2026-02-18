import { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import { getApiHealth } from '../lib/api';
import type { CircuitBreakerStatus } from '../lib/circuit-breaker';

export function ApiHealthIndicator() {
  const [status, setStatus] = useState<CircuitBreakerStatus | null>(null);

  useEffect(() => {
    // Check status periodically
    const checkStatus = () => {
      setStatus(getApiHealth());
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const getStatusConfig = () => {
    switch (status.state) {
      case 'CLOSED':
        return {
          icon: CheckCircle,
          color: 'text-green-400',
          bg: 'bg-green-900/30',
          label: 'Healthy',
        };
      case 'OPEN':
        return {
          icon: AlertCircle,
          color: 'text-red-400',
          bg: 'bg-red-900/30',
          label: 'Service Unavailable',
        };
      case 'HALF_OPEN':
        return {
          icon: Clock,
          color: 'text-amber-400',
          bg: 'bg-amber-900/30',
          label: 'Recovering',
        };
      default:
        return {
          icon: Activity,
          color: 'text-gray-400',
          bg: 'bg-gray-800',
          label: 'Unknown',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  // Only show if there's an issue
  if (status.state === 'CLOSED' && status.consecutiveFailures === 0) {
    return null;
  }

  return (
    <div
      className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs no-drag', config.bg)}
      title={`API Status: ${config.label}\nFailures: ${status.consecutiveFailures}\nSuccesses: ${status.consecutiveSuccesses}`}
    >
      <Icon className={clsx('w-3.5 h-3.5', config.color)} />
      <span className={config.color}>{config.label}</span>
      {status.consecutiveFailures > 0 && (
        <span className="text-gray-500">({status.consecutiveFailures} errors)</span>
      )}
    </div>
  );
}
