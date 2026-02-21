import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Bell, X, AlertTriangle, Info, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationsCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

const typeConfig = {
  success: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
  },
  error: {
    icon: XCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/30',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
  },
  info: {
    icon: Info,
    color: 'text-brand-400',
    bg: 'bg-brand-500/15',
    border: 'border-brand-500/30',
  },
};

export const NotificationsCenter = memo(function NotificationsCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClearAll,
}: NotificationsCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const reduceMotion = useReducedMotion();
  const dur = reduceMotion ? 0 : 0.2;

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-notifications-center]')) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" data-notifications-center>
      {/* Screen reader announcement for unread count */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
          : 'No unread notifications'}
      </span>
      {/* Trigger Button */}
      <button
        type="button"
        id="notifications-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'relative p-2 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
          isOpen
            ? 'bg-slate-800/80 text-gray-200 shadow-inner'
            : 'hover:bg-slate-800/60 text-gray-400 hover:text-gray-200'
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="notifications-center-panel"
      >
        <Bell className="w-5 h-5 text-gray-400" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="notifications-center-panel"
            role="region"
            aria-label="Notifications"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: dur, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-3 w-[90vw] max-w-[26rem] max-h-[75vh] bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllAsRead}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                    title="Clear all"
                    aria-label="Clear all notifications"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-[50vh]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800" aria-live="polite">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={onMarkAsRead}
                      onDismiss={onDismiss}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
                <p className="text-xs text-gray-500 text-center">
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.onAction) {
      notification.onAction();
    }
  };

  return (
    <div
      className={clsx(
        'relative p-4 transition-all duration-200 group',
        !notification.read
          ? 'bg-slate-800/40 hover:bg-slate-800/60 border-l-2 border-l-brand-500'
          : 'hover:bg-slate-800/30 border-l-2 border-l-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
            config.bg
          )}
        >
          <Icon className={clsx('w-4 h-4', config.color)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={clsx('text-sm font-medium', !notification.read && 'text-white')}>
              {notification.title}
            </p>
            {!notification.read && (
              <span className="flex-shrink-0 w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{notification.message}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
            </span>
            {notification.actionLabel && (
              <button
                type="button"
                onClick={handleClick}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
                aria-label={notification.actionLabel}
              >
                {notification.actionLabel}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(notification.id)}
          className="flex-shrink-0 p-1 text-gray-500 hover:text-gray-300 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:opacity-100"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

// Hook for managing notifications
// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(maxNotifications = 50) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => {
        const updated = [newNotification, ...prev];
        return updated.slice(0, maxNotifications);
      });

      return newNotification.id;
    },
    [maxNotifications]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    dismiss,
    clearAll,
    unreadCount: notifications.filter((n) => !n.read).length,
  };
}
