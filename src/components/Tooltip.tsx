import { useState, useRef, useCallback, useId } from 'react';
import clsx from 'clsx';

interface TooltipProps {
  content: string;
  /** Keyboard shortcut to display after the label */
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

const positionStyles: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export function Tooltip({ content, shortcut, position = 'top', children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), 400);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* Clone child to add aria-describedby */}
      <children.type {...children.props} aria-describedby={visible ? tooltipId : undefined} />
      <div
        id={tooltipId}
        role="tooltip"
        aria-hidden={!visible}
        className={clsx(
          'absolute z-50 px-2.5 py-1.5 text-[11px] font-bold tracking-wide text-gray-200 bg-slate-900/90 border border-slate-700/60 rounded-lg shadow-xl backdrop-blur-md whitespace-nowrap pointer-events-none transition-[opacity,transform] duration-150 ease-out',
          positionStyles[position],
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
        )}
      >
        {content}
        {shortcut && (
          <kbd className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-slate-800 text-gray-400 border border-slate-700 rounded-md">
            {shortcut}
          </kbd>
        )}
      </div>
    </div>
  );
}
