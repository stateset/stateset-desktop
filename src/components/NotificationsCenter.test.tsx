/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { renderWithProviders, screen, fireEvent } from '../test-utils';
import { useNotifications, NotificationsCenter, type Notification } from './NotificationsCenter';

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

describe('NotificationsCenter', () => {
  const handlers = () => ({
    onMarkAsRead: vi.fn(),
    onMarkAllAsRead: vi.fn(),
    onDismiss: vi.fn(),
    onClearAll: vi.fn(),
  });

  function makeNotification(overrides: Partial<Notification> = {}): Notification {
    return {
      id: `notif-${Math.random().toString(36).slice(2, 9)}`,
      type: 'info',
      title: 'Test notification',
      message: 'Something happened',
      timestamp: Date.now(),
      read: false,
      ...overrides,
    };
  }

  function openCenter(notifications: Notification[]) {
    const h = handlers();
    renderWithProviders(<NotificationsCenter notifications={notifications} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    return h;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('announces no unread notifications and shows no badge when all are read', () => {
    renderWithProviders(
      <NotificationsCenter notifications={[makeNotification({ read: true })]} {...handlers()} />
    );

    expect(screen.getByText('No unread notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('announces singular and plural unread counts', () => {
    const { unmount } = renderWithProviders(
      <NotificationsCenter notifications={[makeNotification()]} {...handlers()} />
    );
    expect(screen.getByText('1 unread notification')).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <NotificationsCenter
        notifications={[makeNotification(), makeNotification()]}
        {...handlers()}
      />
    );
    expect(screen.getByText('2 unread notifications')).toBeInTheDocument();
  });

  it('caps the badge at 99+', () => {
    const many = Array.from({ length: 100 }, () => makeNotification({ read: false }));
    renderWithProviders(<NotificationsCenter notifications={many} {...handlers()} />);

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('opens the panel and shows the empty state', () => {
    openCenter([]);

    // The ToastProvider also renders a "Notifications" live region, so assert
    // on panel content unique to NotificationsCenter.
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notifications/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('lists notifications with a singular footer count', () => {
    openCenter([makeNotification({ title: 'Only one' })]);

    expect(screen.getByText('Only one')).toBeInTheDocument();
    expect(screen.getByText('1 notification')).toBeInTheDocument();
  });

  it('marks all as read from the header', () => {
    const h = openCenter([makeNotification(), makeNotification()]);

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(h.onMarkAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('hides the mark-all-read button when nothing is unread', () => {
    openCenter([makeNotification({ read: true })]);

    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
  });

  it('clears all notifications from the header', () => {
    const h = openCenter([makeNotification()]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all notifications' }));
    expect(h.onClearAll).toHaveBeenCalledTimes(1);
  });

  it('fires the action and marks read when the action button is clicked', () => {
    const onAction = vi.fn();
    const h = openCenter([
      makeNotification({ id: 'n-action', actionLabel: 'View details', onAction }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(h.onMarkAsRead).toHaveBeenCalledWith('n-action');
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('dismisses a notification', () => {
    const h = openCenter([makeNotification({ id: 'n-dismiss' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(h.onDismiss).toHaveBeenCalledWith('n-dismiss');
  });

  it('closes on Escape', () => {
    openCenter([makeNotification()]);
    const trigger = screen.getByRole('button', { name: /Notifications/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    // Exit animations do not complete in happy-dom, so assert the close
    // state (which also detaches the Escape/outside-click listeners).
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on outside click', () => {
    openCenter([makeNotification()]);
    const trigger = screen.getByRole('button', { name: /Notifications/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
