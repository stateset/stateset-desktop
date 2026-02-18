/**
 * Lightweight performance metrics collection.
 *
 * Tracks API latency percentiles, cache hit/miss rates,
 * circuit breaker transitions, and retry counts so the app
 * has basic observability without external dependencies.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface ApiCallMetric {
  path: string;
  method: string;
  status: number | null;
  durationMs: number;
  retryCount: number;
  fromCache: boolean;
  timestamp: number;
}

export interface MetricsSummary {
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  cacheHitRate: number;
  totalRetries: number;
  circuitBreakerTrips: number;
  windowStartMs: number;
}

// ── Metric Store ────────────────────────────────────────────────────────

const WINDOW_SIZE = 500; // rolling window of recent requests

let callBuffer: ApiCallMetric[] = [];
let circuitBreakerTrips = 0;

export function recordApiCall(metric: ApiCallMetric): void {
  callBuffer.push(metric);
  if (callBuffer.length > WINDOW_SIZE) {
    callBuffer = callBuffer.slice(-WINDOW_SIZE);
  }
}

export function recordCircuitBreakerTrip(): void {
  circuitBreakerTrips += 1;
}

// ── Percentile helper ───────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Summary ─────────────────────────────────────────────────────────────

export function getMetricsSummary(): MetricsSummary {
  const calls = callBuffer;
  const total = calls.length;

  if (total === 0) {
    return {
      totalRequests: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      errorRate: 0,
      cacheHitRate: 0,
      totalRetries: 0,
      circuitBreakerTrips,
      windowStartMs: Date.now(),
    };
  }

  const durations = calls.map((c) => c.durationMs).sort((a, b) => a - b);
  const errors = calls.filter((c) => c.status === null || c.status >= 400).length;
  const cacheHits = calls.filter((c) => c.fromCache).length;
  const retries = calls.reduce((sum, c) => sum + c.retryCount, 0);

  return {
    totalRequests: total,
    avgLatencyMs: Math.round(durations.reduce((s, d) => s + d, 0) / total),
    p50LatencyMs: percentile(durations, 50),
    p95LatencyMs: percentile(durations, 95),
    p99LatencyMs: percentile(durations, 99),
    errorRate: Math.round((errors / total) * 100) / 100,
    cacheHitRate: Math.round((cacheHits / total) * 100) / 100,
    totalRetries: retries,
    circuitBreakerTrips,
    windowStartMs: calls[0].timestamp,
  };
}

/**
 * Reset all collected metrics (useful for testing or session boundaries).
 */
export function resetMetrics(): void {
  callBuffer = [];
  circuitBreakerTrips = 0;
}
