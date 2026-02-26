import { describe, it, expect, vi } from 'vitest';
import { memoize, deepEqual, memoizeFn, throttle, debounce } from './performance';

describe('performance helpers', () => {
  it('memoize keeps displayName and returns component reference', () => {
    function Demo() {
      return null;
    }
    const wrapped = memoize(Demo);
    expect(wrapped).toBe(Demo);
    expect(wrapped.displayName).toBe('Memo(Demo)');
  });

  it('deepEqual compares primitives, arrays, and nested objects', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('memoizeFn caches by default JSON key', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memoized = memoizeFn(fn);

    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('memoizeFn supports custom key function', () => {
    const fn = vi.fn((payload: { id: string; value: number }) => payload.value * 2);
    const memoized = memoizeFn(fn, (payload) => payload.id);

    expect(memoized({ id: 'same', value: 2 })).toBe(4);
    expect(memoized({ id: 'same', value: 99 })).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttle runs immediately and then at most once per delay', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled('b');
      throttled('c');
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounce only invokes after quiet period', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced('b');
      debounced('c');
      expect(fn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
