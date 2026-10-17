import { useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

type DialogVariant = 'danger' | 'warning' | 'info' | 'question';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
}

const confirmVariants = {
  danger: 'danger',
  warning: 'primary',
  info: 'primary',
  question: 'primary',
} as const;

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      role="alertdialog"
      preventClose={isLoading}
    >
      <div className="flex items-center justify-end gap-3 pt-4 border-t ui-modal-divider">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariants[variant]} onClick={onConfirm} loading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// Hook for easier confirm dialog usage
interface UseConfirmDialogOptions {
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirmDialog(options: UseConfirmDialogOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    if (!isLoading) {
      setIsOpen(false);
    }
  }, [isLoading]);

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    try {
      await options.onConfirm();
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const dialogProps = {
    isOpen,
    onClose: close,
    onConfirm: handleConfirm,
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    variant: options.variant,
    isLoading,
  };

  return { open, close, dialogProps, isOpen };
}
