import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationsStore } from './notifications';

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [] });
  });

  it('starts with empty notifications', () => {
    expect(useNotificationsStore.getState().notifications).toEqual([]);
  });

  it('addNotification creates a notification with id and timestamp', () => {
    const id = useNotificationsStore.getState().addNotification({
      type: 'info',
      title: 'Test',
      message: 'Hello',
    });

    expect(id).toMatch(/^notif-/);
    const { notifications } = useNotificationsStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Test');
    expect(notifications[0].message).toBe('Hello');
    expect(notifications[0].read).toBe(false);
    expect(typeof notifications[0].timestamp).toBe('number');
  });

  it('newest notification is first in the list', () => {
    useNotificationsStore.getState().addNotification({
      type: 'info',
      title: 'First',
      message: 'A',
    });
    useNotificationsStore.getState().addNotification({
      type: 'warning',
      title: 'Second',
      message: 'B',
    });

    const { notifications } = useNotificationsStore.getState();
    expect(notifications[0].title).toBe('Second');
    expect(notifications[1].title).toBe('First');
  });

  it('caps at MAX_NOTIFICATIONS (50)', () => {
    for (let i = 0; i < 55; i++) {
      useNotificationsStore.getState().addNotification({
        type: 'info',
        title: `N${i}`,
        message: `Msg ${i}`,
      });
    }

    expect(useNotificationsStore.getState().notifications).toHaveLength(50);
  });

  it('markAsRead sets read=true on matching notification', () => {
    const id = useNotificationsStore.getState().addNotification({
      type: 'info',
      title: 'Test',
      message: 'Hello',
    });

    useNotificationsStore.getState().markAsRead(id);

    const n = useNotificationsStore.getState().notifications.find((x) => x.id === id);
    expect(n?.read).toBe(true);
  });

  it('markAllAsRead marks all notifications as read', () => {
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'A', message: 'a' });
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'B', message: 'b' });

    useNotificationsStore.getState().markAllAsRead();

    const { notifications } = useNotificationsStore.getState();
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it('dismiss removes the matching notification', () => {
    const id1 = useNotificationsStore.getState().addNotification({
      type: 'info',
      title: 'Keep',
      message: 'a',
    });
    const id2 = useNotificationsStore.getState().addNotification({
      type: 'info',
      title: 'Remove',
      message: 'b',
    });

    useNotificationsStore.getState().dismiss(id2);

    const { notifications } = useNotificationsStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe(id1);
  });

  it('clearAll empties the list', () => {
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'X', message: 'x' });
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'Y', message: 'y' });

    useNotificationsStore.getState().clearAll();

    expect(useNotificationsStore.getState().notifications).toEqual([]);
  });
});
