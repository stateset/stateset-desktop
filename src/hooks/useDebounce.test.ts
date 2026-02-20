/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDebounce,
  useDebouncedCallback,
  useThrottledCallback,
  useDebouncedLoading,
} from './useDebounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'hello', delay: 500 },
    });

    expect(result.current).toBe('hello');

    // Change the value
    rerender({ value: 'world', delay: 500 });

    // Value should not have changed yet
    expect(result.current).toBe('hello');

    // Advance time past the delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('world');
  });

  it('resets timer when value changes before delay expires', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Change again before the 300ms elapses
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Still waiting for the full 300ms after last change
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe('c');
  });

  it('uses default delay of 300ms', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated');
  });
});

describe('useDebouncedCallback', () => {
  it('only calls after delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    // Call the debounced function multiple times rapidly
    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    // Callback should not have been called yet
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should only be called once with the last arguments
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('c');
  });

  it('resets timer on each invocation', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('first');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current('second');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 400ms total elapsed, but only 200ms since last call
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('uses default delay of 300ms', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback));

    act(() => {
      result.current();
    });

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('useThrottledCallback', () => {
  it('calls at most once per interval', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 300));

    // First call should execute immediately (timeSinceLastCall >= intervalMs)
    act(() => {
      result.current('first');
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');

    // Second call within the interval should be scheduled, not immediate
    act(() => {
      result.current('second');
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance past interval
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // The trailing call should have fired
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('executes immediately when interval has passed', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 300));

    act(() => {
      result.current('first');
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Wait for interval to pass
    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current('second');
    });
    // Should execute immediately since interval has elapsed
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('replaces pending trailing call with latest', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 300));

    act(() => {
      result.current('first');
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Multiple calls within interval - each should replace the pending one
    act(() => {
      result.current('second');
      result.current('third');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith('third');
  });
});

describe('useDebouncedLoading', () => {
  it('shows loading immediately when loading becomes true', () => {
    const { result } = renderHook(() => useDebouncedLoading(true, 200));
    expect(result.current).toBe(true);
  });

  it('delays hiding loading state', () => {
    const { result, rerender } = renderHook(({ loading }) => useDebouncedLoading(loading, 200), {
      initialProps: { loading: true },
    });

    expect(result.current).toBe(true);

    // Set loading to false
    rerender({ loading: false });

    // Should still show loading (delay not passed)
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Now loading should be hidden
    expect(result.current).toBe(false);
  });

  it('cancels hide if loading becomes true again before delay', () => {
    const { result, rerender } = renderHook(({ loading }) => useDebouncedLoading(loading, 200), {
      initialProps: { loading: true },
    });

    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Set loading back to true before the 200ms expires
    rerender({ loading: true });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should still be loading
    expect(result.current).toBe(true);
  });
});
