import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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
  const reduceMotion = useReducedMotion();
  const dur = reduceMotion ? 0 : 0.2;

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, preventClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget && !preventClose) {
              onClose();
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur, ease: 'easeOut' }}
        >
          <motion.div
            ref={dialogRef}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: dur, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'w-full bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col',
              sizeStyles[size]
            )}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div>
                <h2
                  id={titleId}
                  className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400"
                >
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="text-sm text-gray-400 mt-1 font-medium">
                    {description}
                  </p>
                )}
              </div>
              {!preventClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-slate-800/80 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 group/close"
                  aria-label="Close dialog"
                >
                  <X
                    className="w-5 h-5 text-gray-500 group-hover/close:text-gray-300 group-hover/close:rotate-90 transition-all duration-200"
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
