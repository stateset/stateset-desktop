import { useState, useRef, useEffect, useCallback, useId } from 'react';
import clsx from 'clsx';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  items: DropdownItem[];
  onSelect: (item: DropdownItem) => void;
  align?: 'left' | 'right';
  label?: string;
}

export function Dropdown({ trigger, items, onSelect, align = 'left', label }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
          setActiveIndex(0);
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = items.findIndex((item, i) => i > activeIndex && !item.disabled);
          if (next !== -1) setActiveIndex(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          let prev = -1;
          for (let i = activeIndex - 1; i >= 0; i--) {
            if (!items[i].disabled) {
              prev = i;
              break;
            }
          }
          if (prev !== -1) setActiveIndex(prev);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const item = items[activeIndex];
          if (item && !item.disabled) {
            onSelect(item);
            setIsOpen(false);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          const first = items.findIndex((item) => !item.disabled);
          if (first !== -1) setActiveIndex(first);
          break;
        }
        case 'End': {
          e.preventDefault();
          let last = -1;
          for (let i = items.length - 1; i >= 0; i--) {
            if (!items[i].disabled) {
              last = i;
              break;
            }
          }
          if (last !== -1) setActiveIndex(last);
          break;
        }
      }
    },
    [isOpen, activeIndex, items, onSelect]
  );

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const list = listRef.current;
    const active = list?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  return (
    <div ref={containerRef} className="relative inline-flex" onKeyDown={handleKeyDown}>
      {/* Clone trigger to add aria attributes */}
      <trigger.type
        {...trigger.props}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          trigger.props.onClick?.(e);
          setIsOpen(!isOpen);
          setActiveIndex(-1);
        }}
      />
      {isOpen && (
        <ul
          ref={listRef}
          id={menuId}
          role="listbox"
          aria-label={label}
          className={clsx(
            'absolute z-50 mt-1 top-full min-w-[180px] max-h-64 overflow-auto',
            'bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              role="option"
              aria-selected={index === activeIndex}
              aria-disabled={item.disabled || undefined}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors',
                index === activeIndex && 'bg-gray-800',
                item.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-800'
              )}
              onClick={() => {
                if (!item.disabled) {
                  onSelect(item);
                  setIsOpen(false);
                }
              }}
              onMouseEnter={() => !item.disabled && setActiveIndex(index)}
            >
              {item.icon}
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
