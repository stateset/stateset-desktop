import { memo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: ReactNode;
  disabled?: boolean;
}

interface MenuPosition {
  x: number;
  y: number;
}

/**
 * Context menu component that appears on right-click
 */
export const ContextMenu = memo(function ContextMenu({
  items,
  children,
  disabled = false,
}: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const findNextEnabled = useCallback(
    (fromIndex: number, direction: 1 | -1): number => {
      const len = items.length;
      let idx = fromIndex;
      for (let i = 0; i < len; i++) {
        idx = (idx + direction + len) % len;
        if (!items[idx].disabled) return idx;
      }
      return -1;
    },
    [items]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      // Calculate position, ensuring menu stays within viewport
      const x = Math.min(e.clientX, window.innerWidth - 200);
      const y = Math.min(e.clientY, window.innerHeight - items.length * 40);

      setPosition({ x, y });
      setIsOpen(true);
      setFocusedIndex(-1);
    },
    [disabled, items.length]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onClick();
      handleClose();
    },
    [handleClose]
  );

  // Focus the menu container when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => menuRef.current?.focus());
    }
  }, [isOpen]);

  // Close on click outside and handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
        case 'ArrowDown': {
          e.preventDefault();
          const next = findNextEnabled(focusedIndex, 1);
          if (next !== -1) setFocusedIndex(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev =
            focusedIndex === -1
              ? findNextEnabled(items.length, -1)
              : findNextEnabled(focusedIndex, -1);
          if (prev !== -1) setFocusedIndex(prev);
          break;
        }
        case 'Home': {
          e.preventDefault();
          const first = findNextEnabled(-1, 1);
          if (first !== -1) setFocusedIndex(first);
          break;
        }
        case 'End': {
          e.preventDefault();
          const last = findNextEnabled(items.length, -1);
          if (last !== -1) setFocusedIndex(last);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            handleItemClick(items[focusedIndex]);
          }
          break;
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [findNextEnabled, handleItemClick, isOpen, handleClose, focusedIndex, items]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => handleClose();
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, handleClose]);

  const focusedItemId = focusedIndex >= 0 ? `ctx-item-${items[focusedIndex]?.id}` : undefined;

  return (
    <>
      <div ref={triggerRef} onContextMenu={handleContextMenu}>
        {children}
      </div>
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            tabIndex={-1}
            className="fixed z-50 min-w-[180px] p-1.5 bg-slate-900/80 border border-slate-700/60 rounded-xl shadow-2xl backdrop-blur-xl animate-scale-in outline-none"
            style={{ left: position.x, top: position.y }}
            role="menu"
            aria-orientation="vertical"
            aria-activedescendant={focusedItemId}
          >
            {items.map((item, index) => (
              <div key={item.id}>
                {item.divider && index > 0 && (
                  <div className="my-1.5 mx-2 border-t border-slate-700/50" />
                )}
                <button
                  id={`ctx-item-${item.id}`}
                  tabIndex={-1}
                  onClick={() => handleItemClick(item)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  disabled={item.disabled}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-all duration-150 rounded-lg',
                    item.disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : item.danger
                        ? 'text-rose-400 hover:bg-rose-500/15 hover:shadow-sm hover:shadow-rose-500/10'
                        : 'text-gray-200 hover:bg-slate-800/80',
                    index === focusedIndex &&
                      !item.disabled &&
                      (item.danger
                        ? 'bg-rose-500/15 shadow-sm shadow-rose-500/10'
                        : 'bg-slate-800/80')
                  )}
                  role="menuitem"
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  <span className="font-medium">{item.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
});
