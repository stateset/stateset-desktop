/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useConfirmDialog } from './useConfirmDialog';

// Stub out the heavy ConfirmDialog component; the hook's behavior is what we test.
vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: vi.fn(() => null),
}));

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: string;
}

function getDialogProps(component: ReactElement | null): DialogProps {
  if (!component) {
    throw new Error('Expected ConfirmDialogComponent to be rendered');
  }
  return (component as ReactElement<DialogProps>).props;
}

function requirePromise(promise: Promise<boolean> | undefined): Promise<boolean> {
  if (!promise) {
    throw new Error('confirm was not called');
  }
  return promise;
}

describe('useConfirmDialog', () => {
  it('renders no dialog before confirm is called', () => {
    const { result } = renderHook(() => useConfirmDialog());
    expect(result.current.ConfirmDialogComponent).toBeNull();
  });

  it('opens the dialog with the provided options when confirm is called', () => {
    const { result } = renderHook(() => useConfirmDialog());

    act(() => {
      void result.current.confirm({
        title: 'Delete agent',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        variant: 'danger',
      });
    });

    const props = getDialogProps(result.current.ConfirmDialogComponent);
    expect(props.isOpen).toBe(true);
    expect(props.title).toBe('Delete agent');
    expect(props.message).toBe('This cannot be undone.');
    expect(props.confirmLabel).toBe('Delete');
    expect(props.cancelLabel).toBe('Keep');
    expect(props.variant).toBe('danger');
  });

  it('resolves true when the user confirms', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    let promise: Promise<boolean> | undefined;
    act(() => {
      promise = result.current.confirm({ title: 'Confirm?', message: 'Proceed?' });
    });

    act(() => {
      getDialogProps(result.current.ConfirmDialogComponent).onConfirm();
    });

    await expect(requirePromise(promise)).resolves.toBe(true);
    expect(getDialogProps(result.current.ConfirmDialogComponent).isOpen).toBe(false);
  });

  it('resolves false when the user cancels', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    let promise: Promise<boolean> | undefined;
    act(() => {
      promise = result.current.confirm({ title: 'Confirm?', message: 'Proceed?' });
    });

    act(() => {
      getDialogProps(result.current.ConfirmDialogComponent).onClose();
    });

    await expect(requirePromise(promise)).resolves.toBe(false);
    expect(getDialogProps(result.current.ConfirmDialogComponent).isOpen).toBe(false);
  });

  it('supports sequential confirmations with fresh options', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.confirm({ title: 'First', message: 'one' });
    });
    act(() => {
      getDialogProps(result.current.ConfirmDialogComponent).onClose();
    });
    await expect(requirePromise(first)).resolves.toBe(false);

    let second: Promise<boolean> | undefined;
    act(() => {
      second = result.current.confirm({ title: 'Second', message: 'two' });
    });

    const props = getDialogProps(result.current.ConfirmDialogComponent);
    expect(props.isOpen).toBe(true);
    expect(props.title).toBe('Second');

    act(() => {
      getDialogProps(result.current.ConfirmDialogComponent).onConfirm();
    });
    await expect(requirePromise(second)).resolves.toBe(true);
  });
});
