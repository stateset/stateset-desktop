import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      halfOpenTimeout: 100, // 100ms for faster tests
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      const status = cb.getStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.isHealthy).toBe(true);
    });

    it('should allow calls when CLOSED', () => {
      expect(cb.isCallPermitted()).toBe(true);
    });

    it('should have zero consecutive failures and successes', () => {
      const status = cb.getStatus();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.consecutiveSuccesses).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should increment failure count on error', () => {
      cb.onError();
      expect(cb.getStatus().consecutiveFailures).toBe(1);
    });

    it('should reset success count on error', () => {
      cb.onSuccess();
      cb.onSuccess();
      expect(cb.getStatus().consecutiveSuccesses).toBe(2);
      cb.onError();
      expect(cb.getStatus().consecutiveSuccesses).toBe(0);
    });

    it('should open after reaching failure threshold', () => {
      cb.onError();
      cb.onError();
      expect(cb.getStatus().state).toBe('CLOSED');
      cb.onError(); // Third failure - reaches threshold
      expect(cb.getStatus().state).toBe('OPEN');
      expect(cb.getStatus().isHealthy).toBe(false);
    });

    it('should record lastFailure timestamp', () => {
      expect(cb.getStatus().lastFailure).toBeNull();
      cb.onError();
      expect(cb.getStatus().lastFailure).toBeInstanceOf(Date);
    });
  });

  describe('success handling', () => {
    it('should increment success count on success', () => {
      cb.onSuccess();
      expect(cb.getStatus().consecutiveSuccesses).toBe(1);
    });

    it('should reset failure count on success', () => {
      cb.onError();
      cb.onError();
      expect(cb.getStatus().consecutiveFailures).toBe(2);
      cb.onSuccess();
      expect(cb.getStatus().consecutiveFailures).toBe(0);
    });

    it('should record lastSuccess timestamp', () => {
      expect(cb.getStatus().lastSuccess).toBeNull();
      cb.onSuccess();
      expect(cb.getStatus().lastSuccess).toBeInstanceOf(Date);
    });
  });

  describe('OPEN state', () => {
    beforeEach(() => {
      // Open the circuit
      cb.onError();
      cb.onError();
      cb.onError();
    });

    it('should reject calls when OPEN', () => {
      expect(cb.isCallPermitted()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      expect(cb.getStatus().state).toBe('OPEN');

      // Wait for half-open timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check should trigger transition
      expect(cb.isCallPermitted()).toBe(true);
      expect(cb.getStatus().state).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      cb.onError();
      cb.onError();
      cb.onError();

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));
      cb.isCallPermitted(); // Trigger transition
    });

    it('should allow calls in HALF_OPEN state', () => {
      expect(cb.getStatus().state).toBe('HALF_OPEN');
      expect(cb.isCallPermitted()).toBe(true);
    });

    it('should close after reaching success threshold', () => {
      cb.onSuccess();
      expect(cb.getStatus().state).toBe('HALF_OPEN');
      cb.onSuccess(); // Second success - reaches threshold
      expect(cb.getStatus().state).toBe('CLOSED');
      expect(cb.getStatus().isHealthy).toBe(true);
    });

    it('should reopen on any failure', () => {
      expect(cb.getStatus().state).toBe('HALF_OPEN');
      cb.onError();
      expect(cb.getStatus().state).toBe('OPEN');
    });
  });

  describe('reset', () => {
    it('should reset to CLOSED state', () => {
      cb.onError();
      cb.onError();
      cb.onError();
      expect(cb.getStatus().state).toBe('OPEN');

      cb.reset();

      expect(cb.getStatus().state).toBe('CLOSED');
      expect(cb.getStatus().consecutiveFailures).toBe(0);
      expect(cb.getStatus().consecutiveSuccesses).toBe(0);
      expect(cb.isCallPermitted()).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute function and record success', async () => {
      const result = await cb.execute(async () => 42);
      expect(result).toBe(42);
      expect(cb.getStatus().consecutiveSuccesses).toBe(1);
    });

    it('should execute function and record failure on error', async () => {
      await expect(cb.execute(async () => {
        throw new Error('test error');
      })).rejects.toThrow('test error');
      expect(cb.getStatus().consecutiveFailures).toBe(1);
    });

    it('should throw CircuitBreakerError when OPEN', async () => {
      cb.onError();
      cb.onError();
      cb.onError();

      await expect(cb.execute(async () => 42)).rejects.toThrow(CircuitBreakerError);
    });

    it('should include status in CircuitBreakerError', async () => {
      cb.onError();
      cb.onError();
      cb.onError();

      try {
        await cb.execute(async () => 42);
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect((error as CircuitBreakerError).status.state).toBe('OPEN');
      }
    });
  });

  describe('state change callbacks', () => {
    it('should notify on state change', () => {
      const callback = vi.fn();
      cb.onStateChange(callback);

      cb.onError();
      cb.onError();
      cb.onError();

      expect(callback).toHaveBeenCalledWith('OPEN', 'CLOSED');
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = cb.onStateChange(callback);

      unsubscribe();

      cb.onError();
      cb.onError();
      cb.onError();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not fail if callback throws', () => {
      const badCallback = vi.fn(() => {
        throw new Error('callback error');
      });
      const goodCallback = vi.fn();

      cb.onStateChange(badCallback);
      cb.onStateChange(goodCallback);

      // Should not throw
      cb.onError();
      cb.onError();
      cb.onError();

      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('default configuration', () => {
    it('should use default values when not provided', () => {
      const defaultCb = new CircuitBreaker();

      // Need to check internal config through behavior
      // Default failure threshold is 5
      for (let i = 0; i < 4; i++) {
        defaultCb.onError();
      }
      expect(defaultCb.getStatus().state).toBe('CLOSED');
      defaultCb.onError(); // 5th failure
      expect(defaultCb.getStatus().state).toBe('OPEN');
    });
  });
});

describe('CircuitBreakerError', () => {
  it('should have correct name', () => {
    const status = {
      state: 'OPEN' as const,
      consecutiveFailures: 5,
      consecutiveSuccesses: 0,
      lastFailure: new Date(),
      lastSuccess: null,
      isHealthy: false,
    };

    const error = new CircuitBreakerError('test message', status);
    expect(error.name).toBe('CircuitBreakerError');
    expect(error.message).toBe('test message');
    expect(error.status).toEqual(status);
  });
});
