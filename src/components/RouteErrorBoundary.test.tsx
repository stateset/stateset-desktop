/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function ThrowError({ message = 'Route exploded' }: { message?: string }): JSX.Element {
  throw new Error(message);
}

describe('RouteErrorBoundary', () => {
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
      <RouteErrorBoundary>
        <div>Page content</div>
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('catches errors and shows a fallback with heading and error message', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError message="Route exploded" />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Route exploded')).toBeInTheDocument();
  });

  it('exposes the fallback as an alert', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows a generic message when the error has no message', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError message="" />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('An unexpected error occurred on this page.')).toBeInTheDocument();
  });

  it('logs the error to the console', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError />
      </RouteErrorBoundary>
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'Route error boundary caught:',
      expect.any(Error),
      expect.anything()
    );
  });

  it('"Try Again" resets the boundary and re-renders children', () => {
    let shouldThrow = true;

    function Conditional() {
      if (shouldThrow) throw new Error('Transient error');
      return <div>Recovered</div>;
    }

    render(
      <RouteErrorBoundary>
        <Conditional />
      </RouteErrorBoundary>
    );
    expect(screen.getByText('Transient error')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a link back to the dashboard', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError />
      </RouteErrorBoundary>
    );
    const link = screen.getByRole('link', { name: 'Back to Dashboard' });
    expect(link).toHaveAttribute('href', '/');
  });
});
