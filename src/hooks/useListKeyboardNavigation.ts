import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

interface UseListKeyboardNavigationOptions<T> {
  items: T[];
  /** Get unique identifier for an item */
  getItemId: (item: T) => string;
  /** Called when an item is selected (Enter pressed) */
  onSelect?: (item: T, index: number) => void;
  /** Called when an item is activated (Space pressed) */
  onActivate?: (item: T, index: number) => void;
  /** Called when delete is pressed on an item */
  onDelete?: (item: T, index: number) => void;
  /** Enable wrapping from first to last and vice versa */
  wrap?: boolean;
  /** Orientation of the list */
  orientation?: 'vertical' | 'horizontal';
  /** Allow multi-select with Shift */
  multiSelect?: boolean;
  /** Initial focused index */
  initialIndex?: number;
}

interface UseListKeyboardNavigationResult<T> {
  /** Currently focused index (-1 if none) */
  focusedIndex: number;
  /** Currently focused item (null if none) */
  focusedItem: T | null;
  /** Set of selected item IDs (for multi-select) */
  selectedIds: Set<string>;
  /** Set the focused index programmatically */
  setFocusedIndex: (index: number) => void;
  /** Handle keyboard events on the list container */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Get props to spread on each list item */
  getItemProps: (
    item: T,
    index: number
  ) => {
    tabIndex: number;
    'data-focused': boolean;
    'data-selected': boolean;
    'aria-selected': boolean;
    onFocus: () => void;
    onClick: (e: React.MouseEvent) => void;
  };
  /** Reset selection and focus */
  reset: () => void;
  /** Focus first item */
  focusFirst: () => void;
  /** Focus last item */
  focusLast: () => void;
  /** Select all items (if multi-select enabled) */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Toggle selection of an item */
  toggleSelection: (item: T) => void;
}

export function useListKeyboardNavigation<T>({
  items,
  getItemId,
  onSelect,
  onActivate,
  onDelete,
  wrap = true,
  orientation = 'vertical',
  multiSelect = false,
  initialIndex = -1,
}: UseListKeyboardNavigationOptions<T>): UseListKeyboardNavigationResult<T> {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);

  // Ensure focused index is valid when items change
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, focusedIndex]);

  const focusedItem = focusedIndex >= 0 && focusedIndex < items.length ? items[focusedIndex] : null;

  const moveFocus = useCallback(
    (direction: 'next' | 'prev' | 'first' | 'last') => {
      if (items.length === 0) return;

      setFocusedIndex((current) => {
        switch (direction) {
          case 'first':
            return 0;
          case 'last':
            return items.length - 1;
          case 'next': {
            if (current === -1) return 0;
            if (current >= items.length - 1) {
              return wrap ? 0 : current;
            }
            return current + 1;
          }
          case 'prev': {
            if (current === -1) return items.length - 1;
            if (current <= 0) {
              return wrap ? items.length - 1 : current;
            }
            return current - 1;
          }
          default:
            return current;
        }
      });
    },
    [items.length, wrap]
  );

  const toggleSelection = useCallback(
    (item: T) => {
      const id = getItemId(item);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [getItemId]
  );

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const newSelectedIds = new Set<string>();
      for (let i = start; i <= end; i++) {
        if (items[i]) {
          newSelectedIds.add(getItemId(items[i]));
        }
      }
      setSelectedIds(newSelectedIds);
    },
    [items, getItemId]
  );

  const selectAll = useCallback(() => {
    if (!multiSelect) return;
    const allIds = new Set(items.map(getItemId));
    setSelectedIds(allIds);
  }, [items, getItemId, multiSelect]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const reset = useCallback(() => {
    setFocusedIndex(-1);
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = -1;
  }, []);

  const focusFirst = useCallback(() => {
    if (items.length > 0) {
      setFocusedIndex(0);
    }
  }, [items.length]);

  const focusLast = useCallback(() => {
    if (items.length > 0) {
      setFocusedIndex(items.length - 1);
    }
  }, [items.length]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isVertical = orientation === 'vertical';
      const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
      const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';

      switch (event.key) {
        case nextKey:
          event.preventDefault();
          if (multiSelect && event.shiftKey && focusedIndex >= 0) {
            const nextIndex = Math.min(focusedIndex + 1, items.length - 1);
            selectRange(lastSelectedIndexRef.current, nextIndex);
            setFocusedIndex(nextIndex);
          } else {
            moveFocus('next');
            lastSelectedIndexRef.current = focusedIndex + 1;
          }
          break;

        case prevKey:
          event.preventDefault();
          if (multiSelect && event.shiftKey && focusedIndex >= 0) {
            const prevIndex = Math.max(focusedIndex - 1, 0);
            selectRange(lastSelectedIndexRef.current, prevIndex);
            setFocusedIndex(prevIndex);
          } else {
            moveFocus('prev');
            lastSelectedIndexRef.current = Math.max(focusedIndex - 1, 0);
          }
          break;

        case 'Home':
          event.preventDefault();
          moveFocus('first');
          lastSelectedIndexRef.current = 0;
          break;

        case 'End':
          event.preventDefault();
          moveFocus('last');
          lastSelectedIndexRef.current = items.length - 1;
          break;

        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            onSelect?.(items[focusedIndex], focusedIndex);
          }
          break;

        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            if (multiSelect) {
              toggleSelection(items[focusedIndex]);
              lastSelectedIndexRef.current = focusedIndex;
            } else {
              onActivate?.(items[focusedIndex], focusedIndex);
            }
          }
          break;

        case 'Delete':
        case 'Backspace':
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            onDelete?.(items[focusedIndex], focusedIndex);
          }
          break;

        case 'a':
          if ((event.metaKey || event.ctrlKey) && multiSelect) {
            event.preventDefault();
            selectAll();
          }
          break;

        case 'Escape':
          event.preventDefault();
          clearSelection();
          setFocusedIndex(-1);
          break;
      }
    },
    [
      orientation,
      focusedIndex,
      items,
      multiSelect,
      moveFocus,
      onSelect,
      onActivate,
      onDelete,
      selectAll,
      selectRange,
      toggleSelection,
      clearSelection,
    ]
  );

  const getItemProps = useCallback(
    (item: T, index: number) => {
      const id = getItemId(item);
      const isFocused = index === focusedIndex;
      const isSelected = selectedIds.has(id);

      return {
        tabIndex: isFocused ? 0 : -1,
        'data-focused': isFocused,
        'data-selected': isSelected,
        'aria-selected': isSelected,
        onFocus: () => setFocusedIndex(index),
        onClick: (e: React.MouseEvent) => {
          setFocusedIndex(index);
          if (multiSelect) {
            if (e.shiftKey && lastSelectedIndexRef.current >= 0) {
              selectRange(lastSelectedIndexRef.current, index);
            } else if (e.metaKey || e.ctrlKey) {
              toggleSelection(item);
            } else {
              setSelectedIds(new Set([id]));
            }
            lastSelectedIndexRef.current = index;
          } else {
            onSelect?.(item, index);
          }
        },
      };
    },
    [getItemId, focusedIndex, selectedIds, multiSelect, onSelect, selectRange, toggleSelection]
  );

  return {
    focusedIndex,
    focusedItem,
    selectedIds,
    setFocusedIndex,
    onKeyDown,
    getItemProps,
    reset,
    focusFirst,
    focusLast,
    selectAll,
    clearSelection,
    toggleSelection,
  };
}
