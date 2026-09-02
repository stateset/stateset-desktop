/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageAnalytics } from './UsageAnalytics';
import type { AgentSession, AgentSessionMetrics, AgentSessionStatus } from '../types';

let sessionCounter = 0;

function makeSession(
  status: AgentSessionStatus = 'running',
  metrics: Partial<AgentSessionMetrics> = {}
): AgentSession {
  sessionCounter += 1;
  return {
    id: `session-${sessionCounter}`,
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'response',
    status,
    config: {
      loop_interval_ms: 1000,
      max_iterations: 10,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      mcp_servers: null,
      model: 'test-model',
      temperature: 0,
    },
    metrics: {
      loop_count: 0,
      tokens_used: 0,
      tool_calls: 0,
      errors: 0,
      messages_sent: 0,
      uptime_seconds: 0,
      ...metrics,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('UsageAnalytics', () => {
  it('renders nothing when there are no sessions', () => {
    const { container } = render(<UsageAnalytics sessions={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a labelled Usage Overview section', () => {
    render(<UsageAnalytics sessions={[makeSession()]} />);
    expect(screen.getByRole('heading', { name: 'Usage Overview' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Usage Overview' })).toBeInTheDocument();
  });

  it('counts running and paused sessions as active', () => {
    render(
      <UsageAnalytics
        sessions={[makeSession('running'), makeSession('paused'), makeSession('stopped')]}
      />
    );
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('of 3 total')).toBeInTheDocument();
  });

  it('sums token usage across sessions', () => {
    render(
      <UsageAnalytics
        sessions={[
          makeSession('running', { tokens_used: 100 }),
          makeSession('stopped', { tokens_used: 250 }),
        ]}
      />
    );
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });

  it('sums tool calls across sessions', () => {
    render(
      <UsageAnalytics
        sessions={[
          makeSession('running', { tool_calls: 4 }),
          makeSession('running', { tool_calls: 7 }),
        ]}
      />
    );
    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('formats average and total uptime', () => {
    render(
      <UsageAnalytics
        sessions={[
          makeSession('running', { uptime_seconds: 60 }),
          makeSession('running', { uptime_seconds: 180 }),
        ]}
      />
    );
    // avg = 120s -> "2m", total = 240s -> "4m"
    expect(screen.getByText('2m')).toBeInTheDocument();
    expect(screen.getByText('4m total')).toBeInTheDocument();
  });

  it('formats sub-minute uptime in seconds', () => {
    render(<UsageAnalytics sessions={[makeSession('running', { uptime_seconds: 45 })]} />);
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('shows an alert when sessions are in failed state', () => {
    render(<UsageAnalytics sessions={[makeSession('failed'), makeSession('running')]} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('1 agent in failed state');
  });

  it('pluralizes the failed-state alert', () => {
    render(<UsageAnalytics sessions={[makeSession('failed'), makeSession('failed')]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('2 agents in failed state');
  });

  it('does not show the failed alert when no sessions failed', () => {
    render(<UsageAnalytics sessions={[makeSession('running')]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
