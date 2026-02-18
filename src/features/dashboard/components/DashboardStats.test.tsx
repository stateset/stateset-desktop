/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardStats } from './DashboardStats';
import type { AgentSession } from '../../../types';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: `sess-${Math.random().toString(36).slice(2)}`,
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'interactive',
    status: 'running',
    config: {
      loop_interval_ms: 5000,
      max_iterations: 100,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      custom_instructions: null,
      mcp_servers: [],
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    },
    metrics: {
      loop_count: 10,
      tokens_used: 1000,
      tool_calls: 5,
      errors: 0,
      messages_sent: 3,
      uptime_seconds: 60,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T01:00:00Z',
    ...overrides,
  };
}

describe('DashboardStats', () => {
  it('shows running agent count', () => {
    const sessions = [
      makeSession({ status: 'running' }),
      makeSession({ status: 'running' }),
      makeSession({ status: 'stopped' }),
    ];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 running
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows total tokens', () => {
    const sessions = [
      makeSession({
        metrics: {
          loop_count: 0,
          tokens_used: 2500,
          tool_calls: 0,
          errors: 0,
          messages_sent: 0,
          uptime_seconds: 0,
        },
      }),
      makeSession({
        metrics: {
          loop_count: 0,
          tokens_used: 1500,
          tool_calls: 0,
          errors: 0,
          messages_sent: 0,
          uptime_seconds: 0,
        },
      }),
    ];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('4,000')).toBeInTheDocument();
    expect(screen.getByText('Tokens Used')).toBeInTheDocument();
  });

  it('shows total tool calls', () => {
    const sessions = [
      makeSession({
        metrics: {
          loop_count: 0,
          tokens_used: 0,
          tool_calls: 7,
          errors: 0,
          messages_sent: 0,
          uptime_seconds: 0,
        },
      }),
      makeSession({
        metrics: {
          loop_count: 0,
          tokens_used: 0,
          tool_calls: 3,
          errors: 0,
          messages_sent: 0,
          uptime_seconds: 0,
        },
      }),
    ];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
  });

  it('shows stopped count in summary', () => {
    const sessions = [makeSession({ status: 'stopped' }), makeSession({ status: 'failed' })];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('2 stopped')).toBeInTheDocument();
  });

  it('shows total session count', () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('3 total')).toBeInTheDocument();
  });

  it('handles empty sessions', () => {
    render(<DashboardStats sessions={[]} />);
    // All 4 stat values should be 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(4);
    expect(screen.getByText('0 total')).toBeInTheDocument();
  });
});
