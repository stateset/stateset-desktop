/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StrictMode } from 'react';
import { ToastProvider, useToast } from './ToastProvider';

// Mock framer-motion to render children without animation so toasts
// appear/disappear synchronously under fake timers.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>): JSX.Element => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Strip framer-motion-specific props so they don't end up on DOM elements
function filterDomProps(props: Record<string, unknown>): Record<string, unknown> {
  const {
    initial: _,
    animate: _a,
    exit: _e,
    transition: _t,
    layout: _l,
    className,
    ...rest
  } = props;
  return { className: className as string, ...rest };
}

type ToastApi = ReturnType<typeof useToast>;

function setup(strict = false) {
  const api: { current: ToastApi | null } = { current: null };

  const renders = vi.fn();
  function CaptureApi() {
    renders();
    api.current = useToast();
    return null;
  }

  const content = (
    <ToastProvider>
      <CaptureApi />
    </ToastProvider>
  );
  const utils = render(strict ? <StrictMode>{content}</StrictMode> : content);

  return { api, renders, ...utils };
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a polite live region for notifications', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a toast with title and message', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ title: 'Saved', message: 'Agent saved successfully' });
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Agent saved successfully')).toBeInTheDocument();
  });

  it('announces error toasts as alerts and others as status', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'Something failed', variant: 'error' });
      api.current!.showToast({ message: 'All good', variant: 'success' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Something failed');
    expect(screen.getByRole('status')).toHaveTextContent('All good');
  });

  it('dismisses a toast via the dismiss button', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'Dismiss me' });
    });
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('dismisses a toast programmatically by id', () => {
    const { api } = setup();
    let id = '';
    act(() => {
      id = api.current!.showToast({ message: 'By id' });
    });
    expect(screen.getByText('By id')).toBeInTheDocument();

    act(() => {
      api.current!.dismissToast(id);
    });
    expect(screen.queryByText('By id')).not.toBeInTheDocument();
  });

  it('auto-dismisses a toast after its duration', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'Short lived', durationMs: 3000 });
    });
    expect(screen.getByText('Short lived')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.getByText('Short lived')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Short lived')).not.toBeInTheDocument();
  });

  it('keeps persistent toasts until manually dismissed', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'Sticky', persistent: true });
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Sticky')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Sticky')).not.toBeInTheDocument();
  });

  it('runs the action callback and dismisses the toast', () => {
    const { api } = setup();
    const onAction = vi.fn();
    act(() => {
      api.current!.showToast({ message: 'Deleted', actionLabel: 'Undo', onAction });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
  });

  it('dismissAll clears every toast', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'First', persistent: true });
      api.current!.showToast({ message: 'Second', persistent: true });
    });
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    act(() => {
      api.current!.dismissAll();
    });
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('caps visible toasts at 5, dropping the oldest', () => {
    const { api } = setup();
    act(() => {
      for (let i = 1; i <= 6; i++) {
        api.current!.showToast({ message: `Toast ${i}`, persistent: true });
      }
    });

    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 6')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(5);
  });

  it('retains the exact remaining lifetime across repeated long hover pauses', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({ message: 'Read this', durationMs: 5000 });
    });
    const toast = screen.getByRole('status');
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Read this')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(1998);
    });
    expect(screen.getByText('Read this')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Read this')).not.toBeInTheDocument();
  });

  it('keeps action controls available until both keyboard focus and hover leave', () => {
    const { api } = setup();
    act(() => {
      api.current!.showToast({
        message: 'Deleted',
        actionLabel: 'Undo',
        onAction: vi.fn(),
        durationMs: 5000,
      });
    });
    const toast = screen.getByRole('status');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      undo.focus();
    });
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(undo).toBeInTheDocument();
    act(() => {
      dismiss.focus();
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(dismiss).toBeInTheDocument();
    fireEvent.blur(dismiss, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
  });

  it('keeps unrelated toast consumers from rerendering on progress updates', () => {
    const { api, renders } = setup();
    act(() => {
      api.current!.showToast({ message: 'Counting down', durationMs: 5000 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Counting down')).toBeVisible();
    expect(renders).toHaveBeenCalledOnce();
  });

  it('cleans evicted, dismissed and unmounted timers in Strict Mode', () => {
    const { api, unmount } = setup(true);
    act(() => {
      for (let index = 0; index < 8; index++) api.current!.showToast({ message: `Timed ${index}` });
    });
    expect(screen.getAllByRole('status')).toHaveLength(5);
    expect(vi.getTimerCount()).toBe(10);
    act(() => {
      api.current!.dismissAll();
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      api.current!.showToast({ message: 'Unmount me' });
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useToast throws when used outside the provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Standalone() {
      useToast();
      return null;
    }

    expect(() => render(<Standalone />)).toThrow('useToast must be used within ToastProvider');
    consoleSpy.mockRestore();
  });
});
