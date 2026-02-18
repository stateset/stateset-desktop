import { create } from 'zustand';
import type { Notification, NotificationType } from '../components/NotificationsCenter';

interface NotificationsState {
  notifications: Notification[];
  addNotification: (notification: {
    type: NotificationType;
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const MAX_NOTIFICATIONS = 50;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],

  addNotification: (input) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const notification: Notification = {
      ...input,
      id,
      timestamp: Date.now(),
      read: false,
    };

    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
    }));

    return id;
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  dismiss: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));
