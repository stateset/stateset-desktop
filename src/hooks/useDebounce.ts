import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Returns a debounced value that only updates after the specified delay.
 * Useful for search inputs to avoid making API calls on every keystroke.
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * Returns a debounced callback function.
 * The callback will only be invoked after the specified delay has passed
 * since the last invocation.
 */
export function useDebouncedCallback<Args extends unknown[], R>(
  callback: (...args: Args) => R,
  delayMs: number = 300
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );
}

/**
 * Returns a throttled callback function.
 * The callback will be invoked at most once per specified interval.
 */
export function useThrottledCallback<Args extends unknown[], R>(
  callback: (...args: Args) => R,
  intervalMs: number = 300
): (...args: Args) => void {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= intervalMs) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      } else {
        // Schedule a call for the remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callbackRef.current(...args);
        }, intervalMs - timeSinceLastCall);
      }
    },
    [intervalMs]
  );
}

/**
 * Hook that returns true only after the value has been stable for the delay period.
 * Useful for showing loading states only after a brief delay.
 */
export function useDebouncedLoading(loading: boolean, delayMs: number = 200): boolean {
  const [debouncedLoading, setDebouncedLoading] = useState(loading);

  useEffect(() => {
    if (loading) {
      // Show loading immediately
      setDebouncedLoading(true);
    } else {
      // Delay hiding loading state to prevent flicker
      const timer = setTimeout(() => {
        setDebouncedLoading(false);
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [loading, delayMs]);

  return debouncedLoading;
}
