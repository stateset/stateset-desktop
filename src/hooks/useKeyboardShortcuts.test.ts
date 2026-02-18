/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, type KeyboardShortcut } from './useKeyboardShortcuts';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useKeyboardShortcuts', () => {
  it('calls action when matching key is pressed', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 'k', ctrl: true, action, description: 'Search' }];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('k', { ctrlKey: true });
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not call action when modifiers do not match', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 'k', ctrl: true, action, description: 'Search' }];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('k'); // no ctrl
    expect(action).not.toHaveBeenCalled();
  });

  it('respects shift modifier', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'c', ctrl: true, shift: true, action, description: 'Connections' },
    ];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('c', { ctrlKey: true }); // missing shift
    expect(action).not.toHaveBeenCalled();

    fireKey('c', { ctrlKey: true, shiftKey: true });
    expect(action).toHaveBeenCalledOnce();
  });

  it('is case-insensitive for key matching', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 'k', ctrl: true, action, description: 'Search' }];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('K', { ctrlKey: true });
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not trigger in input elements (except Escape)', () => {
    const action = vi.fn();
    const escapeAction = vi.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: 'k', ctrl: true, action, description: 'Search' },
      { key: 'Escape', action: escapeAction, description: 'Close' },
    ];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Simulate keydown from an input element
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(action).not.toHaveBeenCalled();

    // Escape should work in inputs
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(escapeAction).toHaveBeenCalledOnce();

    document.body.removeChild(input);
  });

  it('removes listener on unmount', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 'k', ctrl: true, action, description: 'Search' }];
    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

    unmount();
    fireKey('k', { ctrlKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('treats metaKey same as ctrlKey for ctrl shortcuts', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 'k', ctrl: true, action, description: 'Search' }];
    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('k', { metaKey: true });
    expect(action).toHaveBeenCalledOnce();
  });
});
