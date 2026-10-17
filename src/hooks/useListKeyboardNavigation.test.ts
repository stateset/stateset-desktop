/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useListKeyboardNavigation } from './useListKeyboardNavigation';

interface Item {
  id: string;
  label: string;
}

const items: Item[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

const getItemId = (item: Item) => item.id;

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return {
    key,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    ...modifiers,
  } as unknown as KeyboardEvent;
}

function mouseEvent(modifiers: Partial<MouseEvent> = {}) {
  return {
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    ...modifiers,
  } as unknown as MouseEvent;
}

describe('useListKeyboardNavigation', () => {
  it('starts with no focus and no selection', () => {
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId }));

    expect(result.current.focusedIndex).toBe(-1);
    expect(result.current.focusedItem).toBeNull();
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('honors initialIndex', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, initialIndex: 1 })
    );

    expect(result.current.focusedIndex).toBe(1);
    expect(result.current.focusedItem).toEqual(items[1]);
  });

  it('moves focus down and up with arrow keys', () => {
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId }));

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(1);

    act(() => result.current.onKeyDown(keyEvent('ArrowUp')));
    expect(result.current.focusedIndex).toBe(0);
  });

  it('wraps around by default', () => {
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId }));

    act(() => result.current.onKeyDown(keyEvent('End')));
    expect(result.current.focusedIndex).toBe(2);

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('ArrowUp')));
    expect(result.current.focusedIndex).toBe(2);
  });

  it('stops at the edges when wrap is disabled', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, wrap: false })
    );

    act(() => result.current.onKeyDown(keyEvent('End')));
    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(2);

    act(() => result.current.onKeyDown(keyEvent('Home')));
    act(() => result.current.onKeyDown(keyEvent('ArrowUp')));
    expect(result.current.focusedIndex).toBe(0);
  });

  it('Home and End jump to the first and last items', () => {
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId }));

    const endEvent = keyEvent('End');
    act(() => result.current.onKeyDown(endEvent));
    expect(result.current.focusedIndex).toBe(2);
    expect(endEvent.preventDefault).toHaveBeenCalled();

    const homeEvent = keyEvent('Home');
    act(() => result.current.onKeyDown(homeEvent));
    expect(result.current.focusedIndex).toBe(0);
    expect(homeEvent.preventDefault).toHaveBeenCalled();
  });

  it('uses left/right arrows in horizontal orientation and ignores up/down', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, orientation: 'horizontal' })
    );

    act(() => result.current.onKeyDown(keyEvent('ArrowRight')));
    expect(result.current.focusedIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.focusedIndex).toBe(0);

    act(() => result.current.onKeyDown(keyEvent('ArrowRight')));
    expect(result.current.focusedIndex).toBe(1);

    act(() => result.current.onKeyDown(keyEvent('ArrowLeft')));
    expect(result.current.focusedIndex).toBe(0);
  });

  it('calls onSelect on Enter for the focused item', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId, onSelect }));

    // Enter with no focus does nothing
    act(() => result.current.onKeyDown(keyEvent('Enter')));
    expect(onSelect).not.toHaveBeenCalled();

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    act(() => result.current.onKeyDown(keyEvent('Enter')));
    expect(onSelect).toHaveBeenCalledWith(items[0], 0);
  });

  it('calls onActivate on Space in single-select mode', () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, onActivate })
    );

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    act(() => result.current.onKeyDown(keyEvent(' ')));
    expect(onActivate).toHaveBeenCalledWith(items[0], 0);
  });

  it('toggles selection on Space in multi-select mode', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    act(() => result.current.onKeyDown(keyEvent(' ')));
    expect(result.current.selectedIds.has('a')).toBe(true);

    act(() => result.current.onKeyDown(keyEvent(' ')));
    expect(result.current.selectedIds.has('a')).toBe(false);
  });

  it('calls onDelete on Delete and Backspace', () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId, onDelete }));

    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    act(() => result.current.onKeyDown(keyEvent('Delete')));
    expect(onDelete).toHaveBeenCalledWith(items[0], 0);

    act(() => result.current.onKeyDown(keyEvent('Backspace')));
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it('selects all with Ctrl+A in multi-select mode only', () => {
    const multi = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );
    act(() => multi.result.current.onKeyDown(keyEvent('a', { ctrlKey: true })));
    expect(multi.result.current.selectedIds).toEqual(new Set(['a', 'b', 'c']));

    const single = renderHook(() => useListKeyboardNavigation({ items, getItemId }));
    act(() => single.result.current.onKeyDown(keyEvent('a', { ctrlKey: true })));
    expect(single.result.current.selectedIds.size).toBe(0);
  });

  it('extends selection with Shift+Arrow in multi-select mode', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.onKeyDown(keyEvent('Home')));
    act(() => result.current.onKeyDown(keyEvent('ArrowDown', { shiftKey: true })));

    expect(result.current.focusedIndex).toBe(1);
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b']));

    act(() => result.current.onKeyDown(keyEvent('ArrowDown', { shiftKey: true })));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('clears selection and focus on Escape', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.selectAll());
    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));

    act(() => result.current.onKeyDown(keyEvent('Escape')));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.focusedIndex).toBe(-1);
  });

  it('clamps the focused index when the items list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useListKeyboardNavigation({ items: list, getItemId }),
      { initialProps: { list: items } }
    );

    act(() => result.current.onKeyDown(keyEvent('End')));
    expect(result.current.focusedIndex).toBe(2);

    rerender({ list: items.slice(0, 1) });
    expect(result.current.focusedIndex).toBe(0);

    rerender({ list: [] });
    expect(result.current.focusedIndex).toBe(-1);
  });

  it('exposes focus helpers (focusFirst, focusLast, reset)', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.focusLast());
    expect(result.current.focusedIndex).toBe(2);

    act(() => result.current.focusFirst());
    expect(result.current.focusedIndex).toBe(0);

    act(() => result.current.toggleSelection(items[1]));
    expect(result.current.selectedIds.has('b')).toBe(true);

    act(() => result.current.reset());
    expect(result.current.focusedIndex).toBe(-1);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('getItemProps reflects focus and selection state', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.focusFirst());
    act(() => result.current.toggleSelection(items[0]));

    const focusedProps = result.current.getItemProps(items[0], 0);
    expect(focusedProps.tabIndex).toBe(0);
    expect(focusedProps['data-focused']).toBe(true);
    expect(focusedProps['data-selected']).toBe(true);
    expect(focusedProps['aria-selected']).toBe(true);

    const otherProps = result.current.getItemProps(items[1], 1);
    expect(otherProps.tabIndex).toBe(-1);
    expect(otherProps['data-focused']).toBe(false);
    expect(otherProps['data-selected']).toBe(false);
  });

  it('click selects the item in single-select mode', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useListKeyboardNavigation({ items, getItemId, onSelect }));

    act(() => result.current.getItemProps(items[1], 1).onClick(mouseEvent()));

    expect(result.current.focusedIndex).toBe(1);
    expect(onSelect).toHaveBeenCalledWith(items[1], 1);
  });

  it('click replaces, ctrl-click toggles, and shift-click ranges in multi-select mode', () => {
    const { result } = renderHook(() =>
      useListKeyboardNavigation({ items, getItemId, multiSelect: true })
    );

    act(() => result.current.getItemProps(items[0], 0).onClick(mouseEvent()));
    expect(result.current.selectedIds).toEqual(new Set(['a']));

    act(() => result.current.getItemProps(items[2], 2).onClick(mouseEvent({ ctrlKey: true })));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'c']));

    act(() => result.current.getItemProps(items[0], 0).onClick(mouseEvent()));
    act(() => result.current.getItemProps(items[2], 2).onClick(mouseEvent({ shiftKey: true })));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b', 'c']));
  });
});
