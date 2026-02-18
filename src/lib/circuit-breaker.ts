/**
 * Circuit Breaker implementation for API resilience
 *
 * Protects the application from cascading failures when the API is unavailable.
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests are rejected immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes needed to close from half-open */
  successThreshold: number;
  /** Time in ms before transitioning from open to half-open */
  halfOpenTimeout: number;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  isHealthy: boolean;
}

type StateChangeCallback = (state: CircuitState, previousState: CircuitState) => void;

/**
 * Circuit Breaker for protecting against API failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private openedAt: Date | null = null;
  private config: CircuitBreakerConfig;
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      halfOpenTimeout: config.halfOpenTimeout ?? 30000, // 30 seconds
    };
  }

  /**
   * Check if a request should be allowed
   */
  isCallPermitted(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if we should transition to half-open
      if (this.openedAt && Date.now() - this.openedAt.getTime() >= this.config.halfOpenTimeout) {
        this.transitionTo('HALF_OPEN');
        return true;
      }
      return false;
    }

    // HALF_OPEN - allow the request to test recovery
    return true;
  }

  /**
   * Record a successful call
   */
  onSuccess(): void {
    this.lastSuccess = new Date();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;

    if (this.state === 'HALF_OPEN') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
        this.openedAt = null;
      }
    }
  }

  /**
   * Record a failed call
   */
  onError(): void {
    this.lastFailure = new Date();
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;

    if (this.state === 'CLOSED') {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
        this.openedAt = new Date();
      }
    } else if (this.state === 'HALF_OPEN') {
      // Any failure in half-open goes back to open
      this.transitionTo('OPEN');
      this.openedAt = new Date();
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      isHealthy: this.state === 'CLOSED',
    };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAt = null;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isCallPermitted()) {
      throw new CircuitBreakerError('Circuit breaker is open', this.getStatus());
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onError();
      throw error;
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const previousState = this.state;
      this.state = newState;

      // Reset counters on state change
      if (newState === 'HALF_OPEN') {
        this.consecutiveSuccesses = 0;
        this.consecutiveFailures = 0;
      }

      // Notify subscribers
      for (const callback of this.stateChangeCallbacks) {
        try {
          callback(newState, previousState);
        } catch {
          // Ignore callback errors
        }
      }
    }
  }
}

/**
 * Error thrown when circuit breaker rejects a request
 */
export class CircuitBreakerError extends Error {
  public readonly status: CircuitBreakerStatus;

  constructor(message: string, status: CircuitBreakerStatus) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.status = status;
  }
}

// Global circuit breaker instance for the API
export const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  halfOpenTimeout: 30000,
});
