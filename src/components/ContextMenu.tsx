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
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

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
    },
    [disabled, items.length]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onClick();
      handleClose();
    },
    [handleClose]
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClose]);

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => handleClose();
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, handleClose]);

  return (
    <>
      <div ref={triggerRef} onContextMenu={handleContextMenu}>
        {children}
      </div>
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[160px] py-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-100"
            style={{ left: position.x, top: position.y }}
            role="menu"
            aria-orientation="vertical"
          >
            {items.map((item, index) => (
              <div key={item.id}>
                {item.divider && index > 0 && <div className="my-1 border-t border-gray-700" />}
                <button
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                    item.disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : item.danger
                        ? 'text-red-400 hover:bg-red-900/30'
                        : 'text-gray-300 hover:bg-gray-800'
                  )}
                  role="menuitem"
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
});
