import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

type ToastVariant = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  progress: number;
  isPaused: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastInput {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  /** If true, the toast will persist until manually dismissed */
  persistent?: boolean;
  /** Label for an optional action button (e.g. "Undo") */
  actionLabel?: string;
  /** Callback when the action button is clicked */
  onAction?: () => void;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-blue-500/45 bg-blue-950/85',
  success: 'border-green-500/45 bg-green-950/85',
  error: 'border-red-500/45 bg-red-950/85',
  warning: 'border-amber-500/45 bg-amber-950/85',
};

const VARIANT_ICONS: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
};

const VARIANT_ICON_COLORS: Record<ToastVariant, string> = {
  info: 'text-blue-400',
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
};

const PROGRESS_COLORS: Record<ToastVariant, string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
};

function createToastId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutMap = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const durationMap = useRef(new Map<string, number>());
  const startTimeMap = useRef(new Map<string, number>());
  const progressIntervalMap = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeoutId = timeoutMap.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMap.current.delete(id);
    }
    const progressInterval = progressIntervalMap.current.get(id);
    if (progressInterval) {
      clearInterval(progressInterval);
      progressIntervalMap.current.delete(id);
    }
    durationMap.current.delete(id);
    startTimeMap.current.delete(id);
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    timeoutMap.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutMap.current.clear();
    progressIntervalMap.current.forEach((interval) => clearInterval(interval));
    progressIntervalMap.current.clear();
    durationMap.current.clear();
    startTimeMap.current.clear();
  }, []);

  const pauseToast = useCallback((id: string) => {
    const timeoutId = timeoutMap.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMap.current.delete(id);
    }
    const progressInterval = progressIntervalMap.current.get(id);
    if (progressInterval) {
      clearInterval(progressInterval);
      progressIntervalMap.current.delete(id);
    }
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, isPaused: true } : toast))
    );
  }, []);

  const resumeToast = useCallback(
    (id: string) => {
      setToasts((prev) => {
        const toast = prev.find((t) => t.id === id);
        if (!toast || !toast.isPaused) return prev;

        const duration = durationMap.current.get(id);
        if (!duration) return prev;

        const remainingTime = duration * (toast.progress / 100);

        if (remainingTime > 0) {
          const timeoutId = setTimeout(() => removeToast(id), remainingTime);
          timeoutMap.current.set(id, timeoutId);

          const interval = setInterval(() => {
            setToasts((current) =>
              current.map((t) => {
                if (t.id !== id || t.isPaused) return t;
                const elapsed = Date.now() - (startTimeMap.current.get(id) || Date.now());
                const totalDuration = durationMap.current.get(id) || 5000;
                const progress = Math.max(0, 100 - (elapsed / totalDuration) * 100);
                return { ...t, progress };
              })
            );
          }, 50);
          progressIntervalMap.current.set(id, interval);
        }

        return prev.map((t) => (t.id === id ? { ...t, isPaused: false } : t));
      });
    },
    [removeToast]
  );

  const showToast = useCallback(
    ({
      title,
      message,
      variant = 'info',
      durationMs = 5000,
      persistent = false,
      actionLabel,
      onAction,
    }: ToastInput) => {
      const id = createToastId();

      setToasts((prev) => {
        // Limit the number of toasts
        const toasts = [
          ...prev,
          { id, title, message, variant, progress: 100, isPaused: false, actionLabel, onAction },
        ];
        if (toasts.length > MAX_TOASTS) {
          const removed = toasts.shift();
          if (removed) {
            const timeoutId = timeoutMap.current.get(removed.id);
            if (timeoutId) clearTimeout(timeoutId);
            timeoutMap.current.delete(removed.id);
            const interval = progressIntervalMap.current.get(removed.id);
            if (interval) clearInterval(interval);
            progressIntervalMap.current.delete(removed.id);
          }
        }
        return toasts;
      });

      if (!persistent) {
        durationMap.current.set(id, durationMs);
        startTimeMap.current.set(id, Date.now());

        const timeoutId = setTimeout(() => removeToast(id), durationMs);
        timeoutMap.current.set(id, timeoutId);

        // Progress bar animation
        const interval = setInterval(() => {
          setToasts((prev) =>
            prev.map((toast) => {
              if (toast.id !== id || toast.isPaused) return toast;
              const elapsed = Date.now() - (startTimeMap.current.get(id) || Date.now());
              const progress = Math.max(0, 100 - (elapsed / durationMs) * 100);
              return { ...toast, progress };
            })
          );
        }, 50);
        progressIntervalMap.current.set(id, interval);
      }

      return id;
    },
    [removeToast]
  );

  useEffect(() => {
    const map = timeoutMap.current;
    const intervals = progressIntervalMap.current;
    return () => {
      map.forEach((timeoutId) => clearTimeout(timeoutId));
      map.clear();
      intervals.forEach((interval) => clearInterval(interval));
      intervals.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: removeToast, dismissAll }}>
      {children}
      <div
        className="fixed right-0 top-4 z-50 flex w-full max-w-sm flex-col gap-2 pointer-events-none px-4 sm:right-4 sm:px-0"
        aria-live="assertive"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const Icon = VARIANT_ICONS[toast.variant];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                onMouseEnter={() => pauseToast(toast.id)}
                onMouseLeave={() => resumeToast(toast.id)}
                className={clsx(
                  'pointer-events-auto flex flex-col overflow-hidden rounded-xl border shadow-xl ring-1 ring-black/20 backdrop-blur-sm',
                  VARIANT_STYLES[toast.variant]
                )}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <Icon
                    className={clsx(
                      'h-5 w-5 flex-shrink-0 mt-0.5',
                      VARIANT_ICON_COLORS[toast.variant]
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex-1 text-sm min-w-0">
                    {toast.title && (
                      <div className="font-semibold text-white truncate">{toast.title}</div>
                    )}
                    <div className="text-gray-200/95 break-words leading-relaxed">
                      {toast.message}
                    </div>
                    {toast.actionLabel && toast.onAction && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.onAction!();
                          removeToast(toast.id);
                        }}
                        className="mt-1 text-xs font-medium underline hover:no-underline transition-colors text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
                      >
                        {toast.actionLabel}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="text-gray-400 hover:text-gray-100 transition-colors p-1 -m-1 rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full bg-black/20">
                  <motion.div
                    className={clsx('h-full', PROGRESS_COLORS[toast.variant])}
                    initial={{ width: '100%' }}
                    animate={{ width: `${toast.progress}%` }}
                    transition={{ duration: 0.05, ease: 'linear' }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
