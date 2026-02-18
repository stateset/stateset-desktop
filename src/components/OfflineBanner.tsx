import { useState } from 'react';
import { useOnlineStatus, getHealthDescription } from '../hooks/useOnlineStatus';
import {
  WifiOff,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

function HealthIndicator({ status, label }: { status: HealthStatus; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {status === 'healthy' ? (
        <CheckCircle2 className="w-3 h-3 text-green-400" />
      ) : status === 'unhealthy' ? (
        <XCircle className="w-3 h-3 text-red-400" />
      ) : (
        <AlertTriangle className="w-3 h-3 text-gray-500" />
      )}
      <span
        className={`text-xs ${
          status === 'healthy'
            ? 'text-green-400'
            : status === 'unhealthy'
              ? 'text-red-400'
              : 'text-gray-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default function OfflineBanner() {
  const status = useOnlineStatus();
  const {
    isOnline,
    isApiReachable,
    isHealthy,
    checkNow,
    isChecking,
    componentHealth,
    latencyMs,
    consecutiveFailures,
    nextRetryIn,
  } = status;
  const [showDetails, setShowDetails] = useState(false);

  // Show banner for any connectivity or health issue
  const showBanner = !isOnline || !isApiReachable || !isHealthy;

  // Determine severity level for banner styling
  const isError = !isOnline || !isApiReachable;
  const isWarning = isOnline && isApiReachable && !isHealthy;

  const healthDescription = getHealthDescription(status);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`border-b ${
            isError
              ? 'bg-red-900/40 border-red-800'
              : isWarning
                ? 'bg-amber-900/40 border-amber-800'
                : 'bg-amber-900/40 border-amber-800'
          }`}
        >
          {/* Main Banner Row */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              {isError ? (
                <WifiOff className="w-4 h-4 text-red-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span className={`text-sm ${isError ? 'text-red-200' : 'text-amber-200'}`}>
                {healthDescription}
              </span>
              {latencyMs !== null && isApiReachable && (
                <span className="text-xs text-gray-500">({latencyMs}ms)</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Details Toggle (only when we have component health data) */}
              {componentHealth && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs ${
                    isError
                      ? 'text-red-400 hover:text-red-300'
                      : 'text-amber-400 hover:text-amber-300'
                  } transition-colors`}
                >
                  Details
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  />
                </button>
              )}

              {/* Retry Button and Countdown */}
              <div className="flex items-center gap-2">
                {nextRetryIn !== null && !isChecking && (
                  <span className={`text-xs ${isError ? 'text-red-400/60' : 'text-amber-400/60'}`}>
                    Retry in {nextRetryIn}s
                  </span>
                )}
                {consecutiveFailures > 1 && (
                  <span className={`text-xs ${isError ? 'text-red-400/60' : 'text-amber-400/60'}`}>
                    ({consecutiveFailures} attempts)
                  </span>
                )}
                <button
                  onClick={checkNow}
                  disabled={isChecking}
                  className={`flex items-center gap-1 px-2 py-1 text-xs ${
                    isError
                      ? 'text-red-400 hover:text-red-300'
                      : 'text-amber-400 hover:text-amber-300'
                  } disabled:opacity-60 disabled:cursor-not-allowed transition-colors`}
                >
                  <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                  {isChecking ? 'Checking' : 'Retry now'}
                </button>
              </div>
            </div>
          </div>

          {/* Expandable Details Panel */}
          <AnimatePresence>
            {showDetails && componentHealth && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={`px-4 pb-3 border-t ${
                  isError ? 'border-red-800/50' : 'border-amber-800/50'
                }`}
              >
                <div className="pt-2 flex flex-wrap gap-x-6 gap-y-1">
                  <HealthIndicator
                    status={componentHealth.database}
                    label={`Database: ${componentHealth.database}`}
                  />
                  <HealthIndicator
                    status={componentHealth.redis}
                    label={`Redis: ${componentHealth.redis}`}
                  />
                  <HealthIndicator
                    status={componentHealth.nats}
                    label={`NATS: ${componentHealth.nats}`}
                  />
                  {status.clientCircuitBreaker.state !== 'CLOSED' && (
                    <HealthIndicator
                      status="unhealthy"
                      label={`Circuit Breaker: ${status.clientCircuitBreaker.state.toLowerCase()}`}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
