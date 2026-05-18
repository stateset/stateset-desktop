import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './ipc-rate-limit';

describe('createRateLimiter', () => {
  it('allows calls under the limit', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000, now: () => 0 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(1)).toBe(true);
    }
  });

  it('rejects the call that exceeds the limit', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(false);
  });

  it('tracks senders independently', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(false);
    // Sender 2 has its own budget.
    expect(limiter.check(2)).toBe(true);
    expect(limiter.check(2)).toBe(true);
    expect(limiter.check(2)).toBe(false);
  });

  it('lets the window slide — old calls expire', () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(limiter.check(1)).toBe(true); // t=0
    t = 500;
    expect(limiter.check(1)).toBe(true); // t=500
    expect(limiter.check(1)).toBe(false); // 3rd in window
    t = 1500; // first call (t=0) is now outside the 1s window
    expect(limiter.check(1)).toBe(true);
  });

  it('forget() drops sender bookkeeping', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(1)).toBe(false);
    limiter.forget(1);
    expect(limiter.check(1)).toBe(true);
  });
});
