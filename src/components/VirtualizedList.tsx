import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';

interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  /** Container height (defaults to 100%) */
  height?: number | string;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Key extractor for items */
  getKey: (item: T, index: number) => string | number;
  /** CSS class for the container */
  className?: string;
  /** Empty state to show when no items */
  emptyState?: ReactNode;
  /** Whether to enable virtualization (set false for small lists) */
  enabled?: boolean;
  /** Minimum items before enabling virtualization */
  minItemsForVirtualization?: number;
}

interface VirtualizedListState {
  scrollTop: number;
  containerHeight: number;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  renderItem,
  height = '100%',
  overscan = 3,
  getKey,
  className = '',
  emptyState,
  enabled = true,
  minItemsForVirtualization = 20,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<VirtualizedListState>({
    scrollTop: 0,
    containerHeight: 0,
  });

  // Calculate visible range
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(state.scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(state.containerHeight / itemHeight) + 2 * overscan;
  const endIndex = Math.min(items.length - 1, startIndex + visibleCount);

  // Determine if virtualization should be applied
  const shouldVirtualize = enabled && items.length >= minItemsForVirtualization;

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop } = containerRef.current;
    setState((prev) => ({ ...prev, scrollTop }));
  }, []);

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const { clientHeight } = container;
      setState((prev) => ({ ...prev, containerHeight: clientHeight }));
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // If virtualization is disabled or list is small, render all items
  if (!shouldVirtualize) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ height, overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        <div>{items.map((item, index) => renderItem(item, index, { height: itemHeight }))}</div>
      </div>
    );
  }

  // Render virtualized list
  const visibleItems = items.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = startIndex + index;
            const style: CSSProperties = {
              height: itemHeight,
              boxSizing: 'border-box',
            };
            return (
              <div key={getKey(item, actualIndex)}>{renderItem(item, actualIndex, style)}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Note: useWindowedList hook moved to hooks/useWindowedList.ts
