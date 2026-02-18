import { useState, useCallback } from 'react';
import { AlertTriangle, Info, HelpCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
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

const variantConfig = {
  danger: {
    icon: XCircle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-900/30',
    confirmVariant: 'danger' as const,
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-900/30',
    confirmVariant: 'primary' as const,
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-900/30',
    confirmVariant: 'primary' as const,
  },
  question: {
    icon: HelpCircle,
    iconColor: 'text-brand-400',
    iconBg: 'bg-brand-900/30',
    confirmVariant: 'primary' as const,
  },
};

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
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      role="alertdialog"
      preventClose={isLoading}
    >
      <div className="flex items-start gap-4 -mt-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            config.iconBg
          )}
        >
          <Icon className={clsx('w-5 h-5', config.iconColor)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-gray-800">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={config.confirmVariant} onClick={onConfirm} loading={isLoading}>
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
