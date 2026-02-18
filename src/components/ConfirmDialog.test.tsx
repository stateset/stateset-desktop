/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmDialog } from './ConfirmDialog';

describe('useConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with closed state', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Test',
        message: 'Test message',
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.dialogProps.isOpen).toBe(false);
  });

  it('should open dialog when open() is called', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Test',
        message: 'Test message',
      })
    );

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.dialogProps.isOpen).toBe(true);
  });

  it('should close dialog when close() is called', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Test',
        message: 'Test message',
      })
    );

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should call onConfirm and close dialog on confirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Test',
        message: 'Test message',
      })
    );

    act(() => {
      result.current.open();
    });

    await act(async () => {
      await result.current.dialogProps.onConfirm();
    });

    expect(onConfirm).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('should pass custom labels to dialogProps', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Custom Title',
        message: 'Custom message',
        confirmLabel: 'Yes, delete',
        cancelLabel: 'No, cancel',
        variant: 'danger',
      })
    );

    expect(result.current.dialogProps.title).toBe('Custom Title');
    expect(result.current.dialogProps.message).toBe('Custom message');
    expect(result.current.dialogProps.confirmLabel).toBe('Yes, delete');
    expect(result.current.dialogProps.cancelLabel).toBe('No, cancel');
    expect(result.current.dialogProps.variant).toBe('danger');
  });

  it('should set isLoading during async confirm', async () => {
    let resolveConfirm: () => void;
    const onConfirm = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );

    const { result } = renderHook(() =>
      useConfirmDialog({
        onConfirm,
        title: 'Test',
        message: 'Test message',
      })
    );

    act(() => {
      result.current.open();
    });

    // Start confirm (don't await)
    let confirmPromise: Promise<void>;
    act(() => {
      confirmPromise = result.current.dialogProps.onConfirm();
    });

    // Should be loading
    expect(result.current.dialogProps.isLoading).toBe(true);

    // Resolve the confirm
    await act(async () => {
      resolveConfirm!();
      await confirmPromise;
    });

    // Should no longer be loading
    expect(result.current.dialogProps.isLoading).toBe(false);
  });
});
