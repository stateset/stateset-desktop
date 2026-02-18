import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiCircuitBreaker, type CircuitBreakerStatus } from '../lib/circuit-breaker';
import { useAuthStore } from '../stores/auth';

/**
 * Component health status from the API
 */
interface ComponentHealth {
  database: 'healthy' | 'unhealthy' | 'unknown';
  nats: 'healthy' | 'unhealthy' | 'unknown';
  redis: 'healthy' | 'unhealthy' | 'unknown';
}

/**
 * Circuit breaker states from the API
 */
interface CircuitBreakerStates {
  sandbox: 'closed' | 'open' | 'half_open';
  webhook: 'closed' | 'open' | 'half_open';
  database: 'closed' | 'open' | 'half_open';
  external_api: 'closed' | 'open' | 'half_open';
}

/**
 * Detailed health response from the API
 */
interface DetailedHealthResponse {
  status: string;
  version: string;
  checks: {
    database: { status: string; latency_ms?: number };
    redis: { status: string; latency_ms?: number };
    nats: { status: string; latency_ms?: number };
  };
  circuit_breakers: CircuitBreakerStates;
  resilience_healthy: boolean;
}

interface OnlineStatus {
  // Basic connectivity
  isOnline: boolean;
  isApiReachable: boolean;
  lastChecked: Date | null;

  // Component health (from API)
  componentHealth: ComponentHealth | null;

  // Circuit breaker states (from API)
  serverCircuitBreakers: CircuitBreakerStates | null;
  serverResilienceHealthy: boolean;

  // Local circuit breaker (client-side)
  clientCircuitBreaker: CircuitBreakerStatus;

  // Overall health indicator
  isHealthy: boolean;

  // API latency
  latencyMs: number | null;

  // In-flight status for manual checks
  isChecking: boolean;

  // Retry information
  consecutiveFailures: number;
  nextRetryIn: number | null;

  // Manual check trigger
  checkNow: () => Promise<void>;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://engine.stateset.cloud.stateset.app';

// Retry configuration
const RETRY_CONFIG = {
  baseIntervalMs: 30000, // 30 seconds when healthy
  minRetryMs: 2000, // 2 seconds minimum retry
  maxRetryMs: 120000, // 2 minutes maximum retry
  offlineCheckMs: 5000, // 5 seconds when offline (for quick recovery detection)
  backoffMultiplier: 1.5, // Exponential backoff factor
};

/**
 * Calculate next retry interval with exponential backoff
 */
function calculateRetryInterval(consecutiveFailures: number, isOffline: boolean): number {
  if (isOffline) {
    // When offline, check more frequently to detect reconnection quickly
    return RETRY_CONFIG.offlineCheckMs;
  }

  if (consecutiveFailures === 0) {
    return RETRY_CONFIG.baseIntervalMs;
  }

  // Exponential backoff with jitter
  const backoff = Math.min(
    RETRY_CONFIG.minRetryMs * Math.pow(RETRY_CONFIG.backoffMultiplier, consecutiveFailures),
    RETRY_CONFIG.maxRetryMs
  );

  // Add jitter (±20%)
  const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
  return Math.round(backoff + jitter);
}

/**
 * Hook to monitor online status, API reachability, and detailed component health.
 * Provides comprehensive visibility into the health of all platform components.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isApiReachable, setIsApiReachable] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);
  const checkInFlightRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Component health from API
  const [componentHealth, setComponentHealth] = useState<ComponentHealth | null>(null);
  const [serverCircuitBreakers, setServerCircuitBreakers] = useState<CircuitBreakerStates | null>(
    null
  );
  const [serverResilienceHealthy, setServerResilienceHealthy] = useState(true);

  // Client-side circuit breaker state
  const [clientCircuitBreaker, setClientCircuitBreaker] = useState<CircuitBreakerStatus>(
    apiCircuitBreaker.getStatus()
  );

  // Subscribe to circuit breaker state changes
  useEffect(() => {
    const unsubscribe = apiCircuitBreaker.onStateChange(() => {
      setClientCircuitBreaker(apiCircuitBreaker.getStatus());
    });

    return unsubscribe;
  }, []);

  // Cleanup function for timers
  const clearTimers = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Schedule next check with exponential backoff
  const scheduleNextCheck = useCallback(
    (failures: number, offline: boolean) => {
      clearTimers();

      const interval = calculateRetryInterval(failures, offline);
      let remaining = interval;

      // Update countdown every second
      setNextRetryIn(Math.ceil(remaining / 1000));
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1000;
        if (remaining > 0) {
          setNextRetryIn(Math.ceil(remaining / 1000));
        } else {
          setNextRetryIn(null);
        }
      }, 1000);

      return interval;
    },
    [clearTimers]
  );

  const checkApiReachability = useCallback(async () => {
    if (checkInFlightRef.current) {
      return;
    }
    checkInFlightRef.current = true;
    setIsChecking(true);
    clearTimers();

    if (!navigator.onLine) {
      setIsApiReachable(false);
      setLatencyMs(null);
      setComponentHealth(null);
      setServerCircuitBreakers(null);
      setServerResilienceHealthy(true);
      setLastChecked(new Date());
      setClientCircuitBreaker(apiCircuitBreaker.getStatus());
      // Increment failures but use offline-specific interval
      setConsecutiveFailures((prev) => prev + 1);
      checkInFlightRef.current = false;
      setIsChecking(false);
      return;
    }

    const startTime = performance.now();
    let checkSucceeded = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Always check basic /health first for reachability (no auth required)
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      setLatencyMs(Math.round(endTime - startTime));

      if (!response.ok) {
        setIsApiReachable(false);
        setComponentHealth(null);
        setServerCircuitBreakers(null);
        setServerResilienceHealthy(true);
      } else {
        setIsApiReachable(true);
        checkSucceeded = true;

        // If authenticated, fetch detailed health for component status
        const apiKey = useAuthStore.getState().apiKey;
        if (apiKey) {
          try {
            const detailedResp = await fetch(`${API_URL}/health/detailed`, {
              method: 'GET',
              headers: { Authorization: `ApiKey ${apiKey}` },
              signal: controller.signal,
            });

            if (detailedResp.ok) {
              const data: DetailedHealthResponse = await detailedResp.json();

              setComponentHealth({
                database: data.checks?.database?.status === 'healthy' ? 'healthy' : 'unhealthy',
                nats: data.checks?.nats?.status === 'healthy' ? 'healthy' : 'unhealthy',
                redis: data.checks?.redis?.status === 'healthy' ? 'healthy' : 'unhealthy',
              });

              if (data.circuit_breakers) {
                setServerCircuitBreakers(data.circuit_breakers);
              }

              setServerResilienceHealthy(data.resilience_healthy ?? true);
            } else {
              // Auth failed but API is reachable — skip component details
              setComponentHealth(null);
              setServerCircuitBreakers(null);
              setServerResilienceHealthy(true);
            }
          } catch {
            // Detailed fetch failed — API is still reachable
            setComponentHealth(null);
            setServerCircuitBreakers(null);
            setServerResilienceHealthy(true);
          }
        } else {
          setComponentHealth(null);
          setServerCircuitBreakers(null);
          setServerResilienceHealthy(true);
        }
      }
    } catch {
      setIsApiReachable(false);
      setLatencyMs(null);
      setComponentHealth(null);
      setServerCircuitBreakers(null);
      setServerResilienceHealthy(true);
    }

    setLastChecked(new Date());
    setClientCircuitBreaker(apiCircuitBreaker.getStatus());

    // Update consecutive failures counter
    if (checkSucceeded) {
      setConsecutiveFailures(0);
    } else {
      setConsecutiveFailures((prev) => prev + 1);
    }

    checkInFlightRef.current = false;
    setIsChecking(false);
  }, [clearTimers]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Reset failures and check immediately when coming back online
      setConsecutiveFailures(0);
      checkApiReachability();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsApiReachable(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkApiReachability();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimers();
    };
  }, [checkApiReachability, clearTimers]);

  // Schedule next check based on current state
  useEffect(() => {
    // Don't schedule while a check is in flight
    if (isChecking) return;

    const interval = scheduleNextCheck(consecutiveFailures, !isOnline);

    // Setup the actual check trigger
    retryTimeoutRef.current = setTimeout(() => {
      checkApiReachability();
    }, interval);

    return () => {
      clearTimers();
    };
  }, [
    isChecking,
    consecutiveFailures,
    isOnline,
    scheduleNextCheck,
    checkApiReachability,
    clearTimers,
  ]);

  // Calculate overall health
  const isHealthy = useMemo(() => {
    // Basic connectivity must be up
    if (!isOnline || !isApiReachable) return false;

    // Client circuit breaker must be healthy
    if (clientCircuitBreaker.state !== 'CLOSED') return false;

    // Server resilience should be healthy
    if (!serverResilienceHealthy) return false;

    // If we have component health data, check it
    if (componentHealth) {
      const hasUnhealthyComponent = Object.values(componentHealth).some(
        (status) => status === 'unhealthy'
      );
      if (hasUnhealthyComponent) return false;
    }

    return true;
  }, [isOnline, isApiReachable, clientCircuitBreaker, serverResilienceHealthy, componentHealth]);

  return {
    isOnline,
    isApiReachable,
    lastChecked,
    componentHealth,
    serverCircuitBreakers,
    serverResilienceHealthy,
    clientCircuitBreaker,
    isHealthy,
    latencyMs,
    isChecking,
    consecutiveFailures,
    nextRetryIn,
    checkNow: checkApiReachability,
  };
}

/**
 * Get a human-readable description of the current health status
 */
export function getHealthDescription(status: OnlineStatus): string {
  if (!status.isOnline) {
    return 'No internet connection';
  }

  if (!status.isApiReachable) {
    return 'Cannot reach StateSet API';
  }

  if (status.clientCircuitBreaker.state === 'OPEN') {
    return 'API temporarily unavailable (circuit breaker open)';
  }

  if (status.clientCircuitBreaker.state === 'HALF_OPEN') {
    return 'Testing API availability...';
  }

  if (!status.serverResilienceHealthy) {
    return 'Some backend services are degraded';
  }

  if (status.componentHealth) {
    const unhealthy = Object.entries(status.componentHealth)
      .filter(([, s]) => s === 'unhealthy')
      .map(([name]) => name);

    if (unhealthy.length > 0) {
      return `Degraded: ${unhealthy.join(', ')}`;
    }
  }

  return 'All systems operational';
}
