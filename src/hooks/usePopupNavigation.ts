import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';

/** Keyboard and focus behavior shared by button-triggered menus and brand lists. */
export function usePopupNavigation(role: 'menu' | 'listbox') {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last' | 'selected'>('selected');
  const search = useRef({ text: '', time: 0 });
  const popupId = useId();

  function items() {
    return Array.from(
      popupRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled), [role="option"]:not(:disabled)'
      ) ?? []
    );
  }

  function close(restoreFocus = false) {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function open(focus: 'first' | 'last' | 'selected' = 'selected') {
    initialFocus.current = focus;
    search.current = { text: '', time: 0 };
    setIsOpen(true);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    const options = items();
    const target =
      initialFocus.current === 'last'
        ? options.at(-1)
        : initialFocus.current === 'selected'
          ? (options.find((item) => item.getAttribute('aria-selected') === 'true') ?? options[0])
          : options[0];
    (target ?? popupRef.current)?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  function onPopupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = items();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = options[(index + 1) % options.length];
        break;
      case 'ArrowUp':
        next = options[(index - 1 + options.length) % options.length];
        break;
      case 'Home':
        next = options[0];
        break;
      case 'End':
        next = options.at(-1);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.key === ' ' ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const now = Date.now();
        const previous = now - search.current.time < 500 ? search.current.text : '';
        const text = previous + event.key.toLocaleLowerCase();
        search.current = { text, time: now };
        // Repeated letters cycle through matching options instead of building "ccc".
        const prefix = new Set(text).size === 1 ? text[0] : text;
        const start = previous && prefix.length > 1 ? index : index + 1;
        next = Array.from(
          { length: options.length },
          (_, offset) => options[(start + offset + options.length) % options.length]
        ).find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(prefix));
      }
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  return {
    isOpen,
    close,
    containerProps: {
      ref: containerRef,
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
      },
    },
    triggerProps: {
      ref: triggerRef,
      'aria-haspopup': role,
      'aria-expanded': isOpen,
      'aria-controls': isOpen ? popupId : undefined,
      onClick: () => (isOpen ? close() : open()),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open(event.key === 'ArrowUp' ? 'last' : 'first');
        }
      },
    },
    popupProps: {
      ref: popupRef,
      id: popupId,
      role,
      tabIndex: -1,
      onKeyDown: onPopupKeyDown,
    },
  };
}
