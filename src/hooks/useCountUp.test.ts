/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from './useCountUp';

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
});

afterEach(() => {
  delete document.documentElement.dataset.reduceMotion;
  vi.useRealTimers();
});

describe('useCountUp', () => {
  it('returns the end value immediately on first render', () => {
    const { result } = renderHook(() => useCountUp({ end: 1234 }));
    expect(result.current).toBe((1234).toLocaleString());
  });

  it('returns an unformatted string when formatLocale is false', () => {
    const { result } = renderHook(() => useCountUp({ end: 1234, formatLocale: false }));
    expect(result.current).toBe('1234');
  });

  it('animates from the previous value to the new value over the duration', () => {
    const { result, rerender } = renderHook(
      ({ end }) => useCountUp({ end, duration: 100, formatLocale: false }),
      { initialProps: { end: 0 } }
    );

    rerender({ end: 100 });

    // Animation has not started yet — value still at the previous end
    expect(result.current).toBe('0');

    // Advance a few frames: value should be in-flight (strictly between 0 and 100)
    act(() => {
      vi.advanceTimersByTime(64);
    });
    const midValue = Number(result.current);
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(100);

    // Finish the animation
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('100');
  });

  it('eases out (covers more than half the distance by mid-duration)', () => {
    const { result, rerender } = renderHook(
      ({ end }) => useCountUp({ end, duration: 160, formatLocale: false }),
      { initialProps: { end: 0 } }
    );

    rerender({ end: 1000 });

    act(() => {
      vi.advanceTimersByTime(96); // ~halfway through, allowing for frame timing
    });

    expect(Number(result.current)).toBeGreaterThan(500);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('1000');
  });

  it('does not animate when the end value is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ end }) => useCountUp({ end, duration: 100, formatLocale: false }),
      { initialProps: { end: 42 } }
    );

    rerender({ end: 42 });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('42');
  });

  it('jumps directly to the end value when reduced motion is enabled', () => {
    document.documentElement.dataset.reduceMotion = 'true';

    const { result, rerender } = renderHook(
      ({ end }) => useCountUp({ end, duration: 100, formatLocale: false }),
      { initialProps: { end: 0 } }
    );

    rerender({ end: 500 });

    // No timers advanced — value should already be at the target
    expect(result.current).toBe('500');
  });

  it('animates downwards when the end value decreases', () => {
    const { result, rerender } = renderHook(
      ({ end }) => useCountUp({ end, duration: 100, formatLocale: false }),
      { initialProps: { end: 100 } }
    );

    rerender({ end: 0 });

    act(() => {
      vi.advanceTimersByTime(64);
    });
    const midValue = Number(result.current);
    expect(midValue).toBeLessThan(100);
    expect(midValue).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('0');
  });

  it('cancels the pending animation frame on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { rerender, unmount } = renderHook(
      ({ end }) => useCountUp({ end, duration: 1000, formatLocale: false }),
      { initialProps: { end: 0 } }
    );

    rerender({ end: 100 });
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
