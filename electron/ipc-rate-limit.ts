/**
 * Per-sender sliding-window rate limiter for IPC handlers.
 *
 * Guards the main process against a misbehaving renderer (or a bug in a
 * polling hook) that floods us with high-frequency calls — e.g. tight loops
 * over `store:get` or `app:getUpdateStatus`.
 *
 * Pure module so it can be unit-tested without spinning up Electron.
 */

export interface RateLimitOptions {
  /** Maximum calls allowed per sender within `windowMs`. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface RateLimiter {
  /**
   * Record a call from `senderId` and return whether it is allowed.
   * Returns `false` when the sender has exceeded `limit` within `windowMs`.
   */
  check(senderId: number): boolean;
  /** Drop bookkeeping for a sender (e.g. when its webContents is destroyed). */
  forget(senderId: number): void;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = options;
  const clock = options.now ?? Date.now;
  const timestamps = new Map<number, number[]>();

  return {
    check(senderId: number): boolean {
      const now = clock();
      const windowStart = now - windowMs;
      const existing = timestamps.get(senderId) ?? [];
      // Drop entries that fell out of the window. Using a filter rebuild keeps
      // the implementation trivially correct; the array stays bounded by `limit + 1`.
      const recent = existing.filter((t) => t > windowStart);
      recent.push(now);
      timestamps.set(senderId, recent);
      return recent.length <= limit;
    },
    forget(senderId: number): void {
      timestamps.delete(senderId);
    },
  };
}
