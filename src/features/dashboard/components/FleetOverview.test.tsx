/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FleetOverview } from './FleetOverview';
import { makeSession } from '../testing/fixtures';
import type { AgentSessionMetrics } from '../../../types';

function metrics(overrides: Partial<AgentSessionMetrics> = {}): AgentSessionMetrics {
  return {
    loop_count: 0,
    tokens_used: 0,
    tool_calls: 0,
    errors: 0,
    messages_sent: 0,
    uptime_seconds: 0,
    ...overrides,
  };
}

describe('FleetOverview', () => {
  it('shows running and stopped counts', () => {
    const sessions = [
      makeSession({ status: 'running', metrics: metrics() }),
      makeSession({ status: 'paused', metrics: metrics() }),
      makeSession({ status: 'stopped', metrics: metrics() }),
    ];
    render(<FleetOverview sessions={sessions} />);
    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // running incl. paused
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('3 agents total')).toBeInTheDocument();
  });

  it('only shows the failed row when sessions have failed', () => {
    const healthy = [makeSession({ status: 'running', metrics: metrics() })];
    const { rerender } = render(<FleetOverview sessions={healthy} />);
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();

    rerender(
      <FleetOverview
        sessions={[...healthy, makeSession({ status: 'failed', metrics: metrics() })]}
      />
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows fleet insights for uptime, cost, tokens, and errors', () => {
    const sessions = [
      makeSession({
        status: 'running',
        metrics: metrics({
          uptime_seconds: 3700,
          estimated_cost_cents: 150,
          tokens_used: 2000,
          errors: 3,
        }),
      }),
    ];
    render(<FleetOverview sessions={sessions} />);
    expect(screen.getByText('Total Uptime')).toBeInTheDocument();
    expect(screen.getByText('1h 1m')).toBeInTheDocument();
    expect(screen.getByText('Est. Cost')).toBeInTheDocument();
    expect(screen.getByText('$1.50')).toBeInTheDocument();
    expect(screen.getByText('Avg Tokens / Agent')).toBeInTheDocument();
    expect(screen.getByText('2.0K')).toBeInTheDocument();
    expect(screen.getByText('Total Errors')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides uptime, cost, and error rows when they are zero', () => {
    const sessions = [makeSession({ status: 'stopped', metrics: metrics({ tokens_used: 500 }) })];
    render(<FleetOverview sessions={sessions} />);
    expect(screen.queryByText('Total Uptime')).not.toBeInTheDocument();
    expect(screen.queryByText('Est. Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Errors')).not.toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('renders without the health bar for an empty fleet', () => {
    render(<FleetOverview sessions={[]} />);
    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    expect(screen.queryByText(/agents total/)).not.toBeInTheDocument();
  });
});
