/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications } from './NotificationsCenter';

describe('useNotifications', () => {
  it('should initialize with empty notifications', () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should add a notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].type).toBe('info');
    expect(result.current.notifications[0].title).toBe('Test');
    expect(result.current.notifications[0].message).toBe('Test message');
    expect(result.current.notifications[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('should mark notification as read', () => {
    const { result } = renderHook(() => useNotifications());

    let notificationId: string;
    act(() => {
      notificationId = result.current.addNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
      });
    });

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAsRead(notificationId);
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].read).toBe(true);
  });

  it('should mark all notifications as read', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test 1',
        message: 'Message 1',
      });
      result.current.addNotification({
        type: 'success',
        title: 'Test 2',
        message: 'Message 2',
      });
    });

    expect(result.current.unreadCount).toBe(2);

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });

  it('should dismiss a notification', () => {
    const { result } = renderHook(() => useNotifications());

    let notificationId: string;
    act(() => {
      notificationId = result.current.addNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
      });
    });

    expect(result.current.notifications).toHaveLength(1);

    act(() => {
      result.current.dismiss(notificationId);
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('should clear all notifications', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test 1',
        message: 'Message 1',
      });
      result.current.addNotification({
        type: 'success',
        title: 'Test 2',
        message: 'Message 2',
      });
    });

    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('should respect maxNotifications limit', () => {
    const { result } = renderHook(() => useNotifications(3));

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.addNotification({
          type: 'info',
          title: `Test ${i}`,
          message: `Message ${i}`,
        });
      }
    });

    expect(result.current.notifications).toHaveLength(3);
    // Most recent should be first
    expect(result.current.notifications[0].title).toBe('Test 4');
  });

  it('should add notifications with correct timestamps', () => {
    const { result } = renderHook(() => useNotifications());
    const beforeTime = Date.now();

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
      });
    });

    const afterTime = Date.now();
    const notification = result.current.notifications[0];

    expect(notification.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(notification.timestamp).toBeLessThanOrEqual(afterTime);
  });

  it('should generate unique IDs for notifications', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        type: 'info',
        title: 'Test 1',
        message: 'Message 1',
      });
      result.current.addNotification({
        type: 'success',
        title: 'Test 2',
        message: 'Message 2',
      });
    });

    const ids = result.current.notifications.map((n) => n.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
