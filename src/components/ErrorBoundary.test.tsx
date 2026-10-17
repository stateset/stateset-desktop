/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary, { withErrorBoundary } from './ErrorBoundary';

// Mock Sentry to prevent import errors
vi.mock('@sentry/electron/renderer', () => ({
  captureException: vi.fn(),
}));

// Component that conditionally throws
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>No error</div>;
}

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress expected console.error output from React error boundary
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('catches render errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    // Should show categorized error title (generic "Unexpected Error" for "Test error")
    expect(screen.getByText('Unexpected Error')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Reload app')).toBeInTheDocument();
  });

  it('shows a network error category for network-related errors', () => {
    function ThrowNetworkError(): JSX.Element {
      throw new Error('network failure occurred');
    }

    render(
      <ErrorBoundary>
        <ThrowNetworkError />
      </ErrorBoundary>
    );
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText('Check your internet connection and try again.')).toBeInTheDocument();
  });

  it('"Try again" resets the error state and re-renders children', () => {
    let shouldThrow = true;

    function Conditional() {
      if (shouldThrow) throw new Error('Test error');
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>
    );
    expect(screen.getByText('Unexpected Error')).toBeInTheDocument();

    // Fix the error condition before clicking retry
    shouldThrow = false;

    fireEvent.click(screen.getByText('Try again'));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });

  it('withErrorBoundary HOC wraps a component with ErrorBoundary', () => {
    function MyComponent() {
      return <div>Wrapped content</div>;
    }

    const WrappedComponent = withErrorBoundary(MyComponent);
    render(<WrappedComponent />);
    expect(screen.getByText('Wrapped content')).toBeInTheDocument();
  });

  it('returns top-level browser recovery to the dashboard path instead of changing only its hash', () => {
    const previous = window.location.href;
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    let failed = true;
    function Page() {
      if (failed) throw new Error('Test error');
      return <div>Recovered dashboard</div>;
    }
    try {
      window.history.replaceState({}, '', '/settings?tab=appearance');
      render(
        <ErrorBoundary>
          <Page />
        </ErrorBoundary>
      );
      failed = false;
      fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
      expect(assign).toHaveBeenCalledWith(`${window.location.origin}/`);
      expect(screen.getByText('Recovered dashboard')).toBeInTheDocument();
    } finally {
      assign.mockRestore();
      window.history.replaceState({}, '', previous);
    }
  });
});
