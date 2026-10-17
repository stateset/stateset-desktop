/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContextMenu } from './useContextMenu';

function makeMouseEvent(clientX: number, clientY: number) {
  const preventDefault = vi.fn();
  const event = { clientX, clientY, preventDefault } as unknown as React.MouseEvent;
  return { event, preventDefault };
}

describe('useContextMenu', () => {
  it('starts closed at origin', () => {
    const { result } = renderHook(() => useContextMenu());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.position).toEqual({ x: 0, y: 0 });
  });

  it('opens at the cursor position and prevents the default context menu', () => {
    const { result } = renderHook(() => useContextMenu());
    const { event, preventDefault } = makeMouseEvent(10, 20);

    act(() => {
      result.current.open(event);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.position).toEqual({ x: 10, y: 20 });
  });

  it('clamps the position so the menu stays within the viewport', () => {
    const { result } = renderHook(() => useContextMenu());
    const { event } = makeMouseEvent(window.innerWidth - 50, window.innerHeight - 50);

    act(() => {
      result.current.open(event);
    });

    expect(result.current.position).toEqual({
      x: window.innerWidth - 200,
      y: window.innerHeight - 200,
    });
  });

  it('closes the menu while preserving the last position', () => {
    const { result } = renderHook(() => useContextMenu());
    const { event } = makeMouseEvent(30, 40);

    act(() => {
      result.current.open(event);
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.position).toEqual({ x: 30, y: 40 });
  });

  it('can reopen at a new position after closing', () => {
    const { result } = renderHook(() => useContextMenu());

    act(() => {
      result.current.open(makeMouseEvent(5, 5).event);
    });
    act(() => {
      result.current.close();
    });
    act(() => {
      result.current.open(makeMouseEvent(50, 60).event);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.position).toEqual({ x: 50, y: 60 });
  });
});
