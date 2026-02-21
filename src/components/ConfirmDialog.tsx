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
    iconBg: 'bg-gradient-to-br from-red-900/40 to-red-900/20',
    iconBorder: 'border border-red-500/20 shadow-lg shadow-red-500/10',
    confirmVariant: 'danger' as const,
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    iconBg: 'bg-gradient-to-br from-amber-900/40 to-amber-900/20',
    iconBorder: 'border border-amber-500/20 shadow-lg shadow-amber-500/10',
    confirmVariant: 'primary' as const,
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-400',
    iconBg: 'bg-gradient-to-br from-blue-900/40 to-blue-900/20',
    iconBorder: 'border border-blue-500/20 shadow-lg shadow-blue-500/10',
    confirmVariant: 'primary' as const,
  },
  question: {
    icon: HelpCircle,
    iconColor: 'text-brand-400',
    iconBg: 'bg-gradient-to-br from-brand-900/40 to-brand-900/20',
    iconBorder: 'border border-brand-500/20 shadow-lg shadow-brand-500/10',
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
            'w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 animate-scale-in',
            config.iconBg,
            config.iconBorder
          )}
        >
          <Icon className={clsx('w-6 h-6', config.iconColor)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-slate-700/60">
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
