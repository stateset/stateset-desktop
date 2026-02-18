import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordApiCall,
  recordCircuitBreakerTrip,
  getMetricsSummary,
  resetMetrics,
} from './metrics';

beforeEach(() => {
  resetMetrics();
});

describe('metrics', () => {
  it('returns empty summary when no calls recorded', () => {
    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.avgLatencyMs).toBe(0);
    expect(summary.errorRate).toBe(0);
  });

  it('records a single successful call', () => {
    recordApiCall({
      path: '/api/test',
      method: 'GET',
      status: 200,
      durationMs: 50,
      retryCount: 0,
      fromCache: false,
      timestamp: Date.now(),
    });

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(1);
    expect(summary.avgLatencyMs).toBe(50);
    expect(summary.errorRate).toBe(0);
    expect(summary.cacheHitRate).toBe(0);
  });

  it('calculates error rate correctly', () => {
    for (let i = 0; i < 3; i++) {
      recordApiCall({
        path: '/api/ok',
        method: 'GET',
        status: 200,
        durationMs: 10,
        retryCount: 0,
        fromCache: false,
        timestamp: Date.now(),
      });
    }
    recordApiCall({
      path: '/api/fail',
      method: 'GET',
      status: 500,
      durationMs: 100,
      retryCount: 1,
      fromCache: false,
      timestamp: Date.now(),
    });

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(4);
    expect(summary.errorRate).toBe(0.25);
    expect(summary.totalRetries).toBe(1);
  });

  it('calculates cache hit rate', () => {
    recordApiCall({
      path: '/api/a',
      method: 'GET',
      status: 200,
      durationMs: 10,
      retryCount: 0,
      fromCache: false,
      timestamp: Date.now(),
    });
    recordApiCall({
      path: '/api/a',
      method: 'GET',
      status: 200,
      durationMs: 1,
      retryCount: 0,
      fromCache: true,
      timestamp: Date.now(),
    });

    const summary = getMetricsSummary();
    expect(summary.cacheHitRate).toBe(0.5);
  });

  it('calculates latency percentiles', () => {
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const d of durations) {
      recordApiCall({
        path: '/api/test',
        method: 'GET',
        status: 200,
        durationMs: d,
        retryCount: 0,
        fromCache: false,
        timestamp: Date.now(),
      });
    }

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(10);
    expect(summary.p50LatencyMs).toBe(50);
    expect(summary.p95LatencyMs).toBe(100);
    expect(summary.p99LatencyMs).toBe(100);
    expect(summary.avgLatencyMs).toBe(55);
  });

  it('tracks circuit breaker trips', () => {
    recordCircuitBreakerTrip();
    recordCircuitBreakerTrip();

    const summary = getMetricsSummary();
    expect(summary.circuitBreakerTrips).toBe(2);
  });

  it('treats null status as error', () => {
    recordApiCall({
      path: '/api/network-fail',
      method: 'GET',
      status: null,
      durationMs: 5000,
      retryCount: 2,
      fromCache: false,
      timestamp: Date.now(),
    });

    const summary = getMetricsSummary();
    expect(summary.errorRate).toBe(1);
    expect(summary.totalRetries).toBe(2);
  });

  it('enforces rolling window size', () => {
    // Fill past the window
    for (let i = 0; i < 600; i++) {
      recordApiCall({
        path: '/api/test',
        method: 'GET',
        status: 200,
        durationMs: 10,
        retryCount: 0,
        fromCache: false,
        timestamp: Date.now(),
      });
    }

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(500); // window size
  });

  it('resets all state', () => {
    recordApiCall({
      path: '/api/test',
      method: 'GET',
      status: 200,
      durationMs: 10,
      retryCount: 0,
      fromCache: false,
      timestamp: Date.now(),
    });
    recordCircuitBreakerTrip();

    resetMetrics();

    const summary = getMetricsSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.circuitBreakerTrips).toBe(0);
  });
});
