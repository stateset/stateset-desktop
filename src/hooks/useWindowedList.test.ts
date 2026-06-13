/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useWindowedList } from './useWindowedList';

type ResizeCallback = (entries: unknown[], observer: unknown) => void;

const resizeCallbacks: ResizeCallback[] = [];

class MockResizeObserver {
  constructor(callback: ResizeCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createContainer(clientHeight: number): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', {
    value: clientHeight,
    writable: true,
    configurable: true,
  });
  return container;
}

function scrollTo(container: HTMLElement, scrollTop: number) {
  container.scrollTop = scrollTop;
  container.dispatchEvent(new Event('scroll'));
}

const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);

beforeEach(() => {
  resizeCallbacks.length = 0;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWindowedList', () => {
  it('computes the initial window at scrollTop 0', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 3));

    // visibleCount = ceil(100 / 10) + 2 * 3 = 16
    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(16);
    expect(result.current.visibleItems).toHaveLength(17);
    expect(result.current.visibleItems[0]).toBe('item-0');
    expect(result.current.totalHeight).toBe(1000);
    expect(result.current.offsetY).toBe(0);
    expect(result.current.containerHeight).toBe(100);
  });

  it('shifts the window when the container scrolls, applying overscan', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 3));

    act(() => {
      scrollTo(container, 200);
    });

    // startIndex = floor(200 / 10) - 3 = 17
    expect(result.current.scrollTop).toBe(200);
    expect(result.current.startIndex).toBe(17);
    expect(result.current.endIndex).toBe(33);
    expect(result.current.offsetY).toBe(170);
    expect(result.current.visibleItems[0]).toBe('item-17');
    expect(result.current.visibleItems.at(-1)).toBe('item-33');
  });

  it('clamps endIndex to the last item near the bottom', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 3));

    act(() => {
      scrollTo(container, 950);
    });

    expect(result.current.startIndex).toBe(92);
    expect(result.current.endIndex).toBe(99);
    expect(result.current.visibleItems.at(-1)).toBe('item-99');
  });

  it('does not let startIndex go below zero with overscan', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 5));

    act(() => {
      scrollTo(container, 20);
    });

    // floor(20 / 10) - 5 = -3 -> clamped to 0
    expect(result.current.startIndex).toBe(0);
    expect(result.current.offsetY).toBe(0);
  });

  it('respects a zero overscan', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 0));

    expect(result.current.startIndex).toBe(0);
    // visibleCount = ceil(100 / 10) = 10
    expect(result.current.endIndex).toBe(10);
    expect(result.current.visibleItems).toHaveLength(11);
  });

  it('handles an empty items list', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList([], ref, 10, 3));

    expect(result.current.totalHeight).toBe(0);
    expect(result.current.visibleItems).toEqual([]);
    expect(result.current.endIndex).toBe(-1);
  });

  it('is safe with a null container ref', () => {
    const ref = { current: null } as unknown as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 3));

    expect(result.current.containerHeight).toBe(0);
    expect(result.current.scrollTop).toBe(0);
    expect(result.current.startIndex).toBe(0);
  });

  it('recomputes the window when the container resizes', () => {
    const container = createContainer(100);
    const ref = { current: container } as RefObject<HTMLElement>;

    const { result } = renderHook(() => useWindowedList(items, ref, 10, 0));
    expect(result.current.endIndex).toBe(10);

    act(() => {
      Object.defineProperty(container, 'clientHeight', {
        value: 200,
        writable: true,
        configurable: true,
      });
      resizeCallbacks.forEach((cb) => cb([], undefined));
    });

    expect(result.current.containerHeight).toBe(200);
    expect(result.current.endIndex).toBe(20);
  });

  it('stops listening to scroll events after unmount', () => {
    const container = createContainer(100);
    const removeSpy = vi.spyOn(container, 'removeEventListener');
    const ref = { current: container } as RefObject<HTMLElement>;

    const { unmount } = renderHook(() => useWindowedList(items, ref, 10, 3));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
