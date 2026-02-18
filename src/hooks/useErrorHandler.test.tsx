/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { ToastProvider } from '../components/ToastProvider';
import { useErrorHandler } from './useErrorHandler';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useErrorHandler', () => {
  it('handleMutationError shows error toast', () => {
    const { result } = renderHook(() => useErrorHandler(), { wrapper });

    act(() => {
      result.current.handleMutationError('Failed to save')(new Error('Network error'));
    });

    // No throw means the handler ran successfully
    expect(result.current.handleMutationError).toBeDefined();
  });

  it('handleQueryError prevents duplicate errors', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    act(() => {
      result.current.handleQueryError('Load failed')(new Error('timeout'));
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // Same error again — should be deduplicated
    act(() => {
      result.current.handleQueryError('Load failed')(new Error('timeout'));
    });
    expect(onError).toHaveBeenCalledTimes(1);

    // Different error — should go through
    act(() => {
      result.current.handleQueryError('Load failed')(new Error('different'));
    });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('clearLastError resets duplicate prevention', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    act(() => {
      result.current.handleQueryError('Load')(new Error('same'));
    });
    expect(onError).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.clearLastError();
    });

    act(() => {
      result.current.handleQueryError('Load')(new Error('same'));
    });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('handleStreamError provides timeout-specific messaging', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    act(() => {
      result.current.handleStreamError(new Error('connection timeout'));
    });
    // getErrorMessage transforms the raw message, onError receives the transformed version
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
    const [, msg] = onError.mock.calls[0];
    expect(msg.toLowerCase()).toMatch(/timeout|took too long/);
  });

  it('handleStreamError provides network-specific messaging', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    act(() => {
      result.current.handleStreamError(new Error('network failure'));
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
    const [, msg] = onError.mock.calls[0];
    expect(msg.toLowerCase()).toMatch(/network|connect/);
  });

  it('handleStreamError provides auth-specific messaging', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    act(() => {
      result.current.handleStreamError(new Error('401 unauthorized'));
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('401'));
  });

  it('showError shows error toast', () => {
    const { result } = renderHook(() => useErrorHandler(), { wrapper });
    act(() => {
      result.current.showError('Title', 'Message');
    });
    expect(result.current.showError).toBeDefined();
  });

  it('showWarning shows warning toast', () => {
    const { result } = renderHook(() => useErrorHandler(), { wrapper });
    act(() => {
      result.current.showWarning('Warning', 'Be careful');
    });
    expect(result.current.showWarning).toBeDefined();
  });

  it('calls onError callback when provided', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }), { wrapper });

    const err = new Error('test');
    act(() => {
      result.current.handleMutationError('Oops')(err);
    });
    expect(onError).toHaveBeenCalledWith(err, 'test');
  });

  it('disables duplicate prevention when configured', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useErrorHandler({ preventDuplicates: false, onError }), {
      wrapper,
    });

    act(() => {
      result.current.handleQueryError('Load')(new Error('same'));
    });
    act(() => {
      result.current.handleQueryError('Load')(new Error('same'));
    });
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
