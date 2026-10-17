import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  role?: 'dialog' | 'alertdialog';
  /** Prevent closing via Escape or backdrop click */
  preventClose?: boolean;
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  role = 'dialog',
  preventClose = false,
}: ModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, preventClose]);

  return isOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !preventClose) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={clsx(
          'ui-modal max-h-[calc(100vh-3rem)] w-full border rounded-xl shadow-xl flex flex-col overflow-hidden',
          sizeStyles[size]
        )}
      >
        <div className="flex shrink-0 items-start justify-between px-6 pt-6 pb-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="ui-modal-description text-sm mt-1">
                {description}
              </p>
            )}
          </div>
          {!preventClose && (
            <button
              type="button"
              onClick={onClose}
              className="ui-button ui-button-ghost p-1.5 rounded-lg ml-3 shrink-0"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  ) : null;
}
