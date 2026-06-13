/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppLoadingScreen } from './AppLoadingScreen';
import type { AuthError } from '../stores/auth';

const networkError: AuthError = {
  code: 'NETWORK_ERROR',
  message: 'Unable to connect',
  details: 'Check your internet connection.',
};

describe('AppLoadingScreen', () => {
  it('renders branding and the default initializing message', () => {
    render(<AppLoadingScreen />);
    expect(screen.getByRole('heading', { name: 'StateSet' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Starting up...');
  });

  it('shows the authenticating message', () => {
    render(<AppLoadingScreen status="authenticating" />);
    expect(screen.getByRole('status')).toHaveTextContent('Verifying credentials...');
  });

  it('shows the loading message', () => {
    render(<AppLoadingScreen status="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  });

  it('renders the error message and details as an alert', () => {
    render(<AppLoadingScreen error={networkError} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to connect');
    expect(alert).toHaveTextContent('Check your internet connection.');
  });

  it('hides the loading status while an error is shown', () => {
    render(<AppLoadingScreen error={networkError} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a retry button that calls onRetry', () => {
    const onRetry = vi.fn();
    render(<AppLoadingScreen error={networkError} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render a retry button without an onRetry handler', () => {
    render(<AppLoadingScreen error={networkError} />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('renders an error without details', () => {
    render(<AppLoadingScreen error={{ code: 'UNKNOWN', message: 'Something went wrong' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
