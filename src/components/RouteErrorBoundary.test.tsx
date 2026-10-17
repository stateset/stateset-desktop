/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as renderDOM, screen, fireEvent } from '@testing-library/react';
import { HashRouter, MemoryRouter, useLocation, useNavigate } from 'react-router';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function render(element: ReactElement) {
  return renderDOM(<MemoryRouter>{element}</MemoryRouter>);
}

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
    expect(screen.getByRole('heading', { name: 'This page couldn’t load' })).toBeInTheDocument();
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
    expect(
      screen.getByText('Try again, or return to the dashboard to continue.')
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
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

  it('keeps packaged dashboard recovery within the hash router', () => {
    renderDOM(
      <HashRouter>
        <RouteErrorBoundary>
          <ThrowError />
        </RouteErrorBoundary>
      </HashRouter>
    );
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '#/');
  });

  it('recovers when navigation selects a different chat on the same page', async () => {
    function RouteContent() {
      const location = useLocation();
      if (new URLSearchParams(location.search).get('chat') === 'broken')
        throw new Error('Broken chat');
      return <h1>Working page</h1>;
    }
    function Navigation() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('?chat=working')}>Open working page</button>;
    }
    renderDOM(
      <MemoryRouter initialEntries={['/playground?chat=broken']}>
        <Navigation />
        <RouteErrorBoundary>
          <RouteContent />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open working page' }));
    expect(await screen.findByRole('heading', { name: 'Working page' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers reload for a rejected page module instead of retrying its cached rejection', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError message="Failed to fetch dynamically imported module: /assets/Settings.js" />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument();
  });

  it('preserves healthy page input across query navigation', () => {
    function Editor() {
      const [draft, setDraft] = useState('');
      const navigate = useNavigate();
      return (
        <>
          <input
            aria-label="Draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button onClick={() => navigate('?chat=another')}>Select another chat</button>
        </>
      );
    }
    render(
      <RouteErrorBoundary>
        <Editor />
      </RouteErrorBoundary>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'Keep my unsent input' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select another chat' }));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep my unsent input');
  });

  it('focuses the failure heading and offers details without making them the main message', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(document.title).toBe('Page unavailable — StateSet');
    expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open');
  });

  it('restores focus to recovered page content after retry', () => {
    let failed = true;
    function Page() {
      if (failed) throw new Error('Transient render error');
      return <h1>Recovered page</h1>;
    }
    render(
      <RouteErrorBoundary>
        <Page />
      </RouteErrorBoundary>
    );
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { name: 'Recovered page' })).toHaveFocus();
  });

  it('handles a non-Error rejection without crashing the recovery screen', () => {
    function Broken(): JSX.Element {
      throw { message: 42 };
    }
    render(
      <RouteErrorBoundary>
        <Broken />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: 'This page couldn’t load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
