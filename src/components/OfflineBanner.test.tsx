/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflineBanner from './OfflineBanner';
import { useOnlineStatus, getHealthDescription } from '../hooks/useOnlineStatus';

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
  getHealthDescription: vi.fn(),
}));

// Mock framer-motion to render children without animation
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
  const { initial: _, animate: _a, exit: _e, transition: _t, className, ...rest } = props;
  return { className: className as string, ...rest };
}

const mockUseOnlineStatus = useOnlineStatus as ReturnType<typeof vi.fn>;
const mockGetHealthDescription = getHealthDescription as ReturnType<typeof vi.fn>;

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    isOnline: true,
    isApiReachable: true,
    isHealthy: true,
    isChecking: false,
    componentHealth: null,
    clientCircuitBreaker: { state: 'CLOSED', failures: 0 },
    latencyMs: null,
    consecutiveFailures: 0,
    nextRetryIn: null,
    checkNow: vi.fn(),
    lastChecked: null,
    serverCircuitBreakers: null,
    serverResilienceHealthy: true,
    ...overrides,
  };
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when online and healthy', () => {
    mockUseOnlineStatus.mockReturnValue(makeStatus());
    mockGetHealthDescription.mockReturnValue('All systems operational');
    const { container } = render(<OfflineBanner />);
    // The AnimatePresence should render nothing because showBanner is false
    expect(container.innerHTML).toBe('');
  });

  it('shows error banner when offline', () => {
    const status = makeStatus({
      isOnline: false,
      isApiReachable: false,
      isHealthy: false,
    });
    mockUseOnlineStatus.mockReturnValue(status);
    mockGetHealthDescription.mockReturnValue('No internet connection');

    render(<OfflineBanner />);
    expect(screen.getByText('No internet connection')).toBeInTheDocument();
    expect(screen.getByText('Retry now')).toBeInTheDocument();
  });

  it('shows warning banner when API is reachable but unhealthy', () => {
    const status = makeStatus({
      isOnline: true,
      isApiReachable: true,
      isHealthy: false,
      componentHealth: {
        database: 'unhealthy',
        redis: 'healthy',
        nats: 'healthy',
      },
    });
    mockUseOnlineStatus.mockReturnValue(status);
    mockGetHealthDescription.mockReturnValue('Degraded: database');

    render(<OfflineBanner />);
    expect(screen.getByText('Degraded: database')).toBeInTheDocument();
  });

  it('shows warning banner when API is unreachable', () => {
    const status = makeStatus({
      isOnline: true,
      isApiReachable: false,
      isHealthy: false,
    });
    mockUseOnlineStatus.mockReturnValue(status);
    mockGetHealthDescription.mockReturnValue('Cannot reach StateSet API');

    render(<OfflineBanner />);
    expect(screen.getByText('Cannot reach StateSet API')).toBeInTheDocument();
  });
});
