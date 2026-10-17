/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ApiHealthIndicator } from './ApiHealthIndicator';
import { getApiHealth } from '../lib/api';
import type { CircuitBreakerStatus } from '../lib/circuit-breaker';

vi.mock('../lib/api', () => ({
  getApiHealth: vi.fn(),
}));

const mockGetApiHealth = vi.mocked(getApiHealth);

function makeStatus(overrides: Partial<CircuitBreakerStatus> = {}): CircuitBreakerStatus {
  return {
    state: 'CLOSED',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastFailure: null,
    lastSuccess: null,
    isHealthy: true,
    ...overrides,
  };
}

describe('ApiHealthIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders nothing when the API is healthy', () => {
    mockGetApiHealth.mockReturnValue(makeStatus());
    const { container } = render(<ApiHealthIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows degraded status when there are failures while closed', () => {
    mockGetApiHealth.mockReturnValue(makeStatus({ consecutiveFailures: 2, isHealthy: true }));
    render(<ApiHealthIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Healthy');
    expect(screen.getByText('(2 errors)')).toBeInTheDocument();
  });

  it('shows service unavailable when the circuit is open', () => {
    mockGetApiHealth.mockReturnValue(
      makeStatus({ state: 'OPEN', consecutiveFailures: 5, isHealthy: false })
    );
    render(<ApiHealthIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Service Unavailable');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('(5 errors)')).toBeInTheDocument();
  });

  it('uses singular error wording for a single failure', () => {
    mockGetApiHealth.mockReturnValue(makeStatus({ consecutiveFailures: 1 }));
    render(<ApiHealthIndicator />);
    expect(screen.getByText('(1 error)')).toBeInTheDocument();
  });

  it('shows recovering state when half-open', () => {
    mockGetApiHealth.mockReturnValue(
      makeStatus({ state: 'HALF_OPEN', consecutiveFailures: 3, isHealthy: false })
    );
    render(<ApiHealthIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Recovering');
    expect(screen.queryByRole('button', { name: 'Retry API connection' })).not.toBeInTheDocument();
  });

  it('shows a labelled retry button only when the circuit is open', () => {
    mockGetApiHealth.mockReturnValue(
      makeStatus({ state: 'OPEN', consecutiveFailures: 5, isHealthy: false })
    );
    render(<ApiHealthIndicator />);
    expect(screen.getByRole('button', { name: 'Retry API connection' })).toBeInTheDocument();
  });

  it('disables the retry button while retrying, then re-checks status', () => {
    mockGetApiHealth.mockReturnValue(
      makeStatus({ state: 'OPEN', consecutiveFailures: 5, isHealthy: false })
    );
    render(<ApiHealthIndicator />);
    const callsBefore = mockGetApiHealth.mock.calls.length;

    const retry = screen.getByRole('button', { name: 'Retry API connection' });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(retry).not.toBeDisabled();
    expect(mockGetApiHealth.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('polls for status updates on an interval', () => {
    mockGetApiHealth.mockReturnValue(
      makeStatus({ state: 'OPEN', consecutiveFailures: 5, isHealthy: false })
    );
    render(<ApiHealthIndicator />);

    mockGetApiHealth.mockReturnValue(makeStatus());
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
