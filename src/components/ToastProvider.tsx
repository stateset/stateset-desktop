import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SEVERITY_CONFIG, type Severity } from '../lib/severityStyles';

type ToastVariant = Severity;

interface Toast {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  progress: number | null;
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

interface ToastClock {
  duration: number | null;
  remaining: number;
  startedAt: number;
  hovered: boolean;
  focused: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
}

function clearScheduled(clock: ToastClock) {
  clearTimeout(clock.timeout);
  clearInterval(clock.interval);
  clock.timeout = undefined;
  clock.interval = undefined;
}

function createToastId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const clocks = useRef(new Map<string, ToastClock>());

  const removeToast = useCallback((id: string) => {
    const clock = clocks.current.get(id);
    if (clock) clearScheduled(clock);
    clocks.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    clocks.current.forEach(clearScheduled);
    clocks.current.clear();
    setToasts([]);
  }, []);

  const scheduleToast = useCallback(
    (id: string, clock: ToastClock) => {
      if (clock.duration === null) return;
      clock.startedAt = Date.now();
      clock.timeout = setTimeout(() => removeToast(id), clock.remaining);
      clock.interval = setInterval(() => {
        const remaining = Math.max(0, clock.remaining - (Date.now() - clock.startedAt));
        const progress = clock.duration ? (remaining / clock.duration) * 100 : 0;
        setToasts((prev) =>
          prev.map((toast) => (toast.id === id ? { ...toast, progress } : toast))
        );
      }, 50);
    },
    [removeToast]
  );

  const updatePause = useCallback(
    (id: string, reason: 'hovered' | 'focused', paused: boolean) => {
      const clock = clocks.current.get(id);
      if (!clock || clock.duration === null) return;
      const wasPaused = clock.hovered || clock.focused;
      clock[reason] = paused;
      const isPaused = clock.hovered || clock.focused;
      if (wasPaused === isPaused) return;
      if (isPaused) {
        clearScheduled(clock);
        clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.startedAt));
        const progress = clock.duration ? (clock.remaining / clock.duration) * 100 : 0;
        setToasts((prev) =>
          prev.map((toast) => (toast.id === id ? { ...toast, progress } : toast))
        );
      } else {
        scheduleToast(id, clock);
      }
    },
    [scheduleToast]
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
      // Keep timer work outside React state updaters, which can run more than once.
      if (clocks.current.size >= MAX_TOASTS) {
        const oldest = clocks.current.keys().next().value;
        if (oldest) removeToast(oldest);
      }
      const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 5000;
      const clock: ToastClock = {
        duration: persistent ? null : duration,
        remaining: duration,
        startedAt: Date.now(),
        hovered: false,
        focused: false,
      };
      clocks.current.set(id, clock);
      setToasts((prev) => [
        ...prev,
        {
          id,
          title,
          message,
          variant,
          progress: persistent ? null : 100,
          actionLabel,
          onAction,
        },
      ]);
      scheduleToast(id, clock);
      return id;
    },
    [removeToast, scheduleToast]
  );

  useEffect(() => {
    const active = clocks.current;
    return () => {
      active.forEach(clearScheduled);
      active.clear();
    };
  }, []);

  const context = useMemo(
    () => ({ showToast, dismissToast: removeToast, dismissAll }),
    [showToast, removeToast, dismissAll]
  );

  return (
    <ToastContext.Provider value={context}>
      {children}
      <div
        className="fixed right-0 top-4 z-50 flex w-full max-w-sm flex-col gap-2 pointer-events-none px-4 sm:right-4 sm:px-0"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const Icon = SEVERITY_CONFIG[toast.variant].icon;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                onMouseEnter={() => updatePause(toast.id, 'hovered', true)}
                onMouseLeave={() => updatePause(toast.id, 'hovered', false)}
                onFocusCapture={() => updatePause(toast.id, 'focused', true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    updatePause(toast.id, 'focused', false);
                  }
                }}
                data-variant={toast.variant}
                role={toast.variant === 'error' ? 'alert' : 'status'}
                aria-atomic="true"
                className="toast pointer-events-auto flex flex-col overflow-hidden rounded-xl border shadow-lg"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <Icon className="toast-icon h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 text-sm min-w-0">
                    {toast.title && <div className="toast-title font-semibold">{toast.title}</div>}
                    <div className="toast-message break-words leading-relaxed">{toast.message}</div>
                    {toast.actionLabel && toast.onAction && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.onAction!();
                          removeToast(toast.id);
                        }}
                        className="toast-action mt-1 text-xs font-medium underline underline-offset-2 hover:no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded"
                      >
                        {toast.actionLabel}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="toast-dismiss transition-colors p-1 -m-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {toast.progress !== null && (
                  <div className="toast-progress-track h-0.5 w-full" aria-hidden="true">
                    <motion.div
                      className="toast-progress h-full"
                      initial={{ width: '100%' }}
                      animate={{ width: `${toast.progress}%` }}
                      transition={{ duration: 0.05, ease: 'linear' }}
                    />
                  </div>
                )}
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
