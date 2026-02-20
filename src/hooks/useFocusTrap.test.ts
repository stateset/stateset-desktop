/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusTrap, useAutoFocus } from './useFocusTrap';

describe('useFocusTrap', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useFocusTrap(false));
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('current');
  });

  it('returns a ref with null current when inactive', () => {
    const { result } = renderHook(() => useFocusTrap(false));
    expect(result.current.current).toBeNull();
  });

  it('returns stable ref across re-renders', () => {
    const { result, rerender } = renderHook(({ isActive }) => useFocusTrap(isActive), {
      initialProps: { isActive: false },
    });

    const firstRef = result.current;
    rerender({ isActive: false });
    expect(result.current).toBe(firstRef);
  });
});

describe('useAutoFocus', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useAutoFocus());
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('current');
  });

  it('returns a ref with null current when no element is attached', () => {
    const { result } = renderHook(() => useAutoFocus(true));
    expect(result.current.current).toBeNull();
  });

  it('returns stable ref across re-renders', () => {
    const { result, rerender } = renderHook(({ shouldFocus }) => useAutoFocus(shouldFocus), {
      initialProps: { shouldFocus: true },
    });

    const firstRef = result.current;
    rerender({ shouldFocus: true });
    expect(result.current).toBe(firstRef);
  });

  it('accepts shouldFocus=false without error', () => {
    const { result } = renderHook(() => useAutoFocus(false));
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull();
  });
});
