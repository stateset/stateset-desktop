/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('labels running and paused sessions as active without including transitions or failures', () => {
    render(
      <DashboardStats
        sessions={['running', 'paused', 'starting', 'stopping', 'failed', 'stopped'].map((status) =>
          makeSession({ status: status as AgentSession['status'] })
        )}
      />
    );
    expect(screen.getByRole('group', { name: 'Active: 2' })).toBeInTheDocument();
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
    expect(screen.getByText('4.0K')).toBeInTheDocument();
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

  it('shows total count in running card subtitle', () => {
    const sessions = [makeSession({ status: 'stopped' }), makeSession({ status: 'failed' })];
    render(<DashboardStats sessions={sessions} />);
    expect(screen.getByText('2 total')).toBeInTheDocument();
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

  it('shows per-session values without presenting different sessions as percentage growth', () => {
    const sessions = Array.from({ length: 4 }, (_, index) =>
      makeSession({
        id: `session-${index}`,
        name: `Agent ${index + 1}`,
        created_at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        metrics: { ...makeSession().metrics, loop_count: (index + 1) * 100 },
      })
    );
    render(<DashboardStats sessions={sessions} />);
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
    const card = screen.getByRole('group', {
      name: `Total Loops: ${Number(1000).toLocaleString()}`,
    });
    expect(within(card).getByText('All sessions')).toBeInTheDocument();
    expect(within(card).getByText('Per session · last 4')).toBeInTheDocument();
    const list = within(card).getByRole('list', { name: 'Total Loops by session, oldest first' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Agent 1: 100', 'Agent 2: 200', 'Agent 3: 300', 'Agent 4: 400']);
  });

  it('keeps totals across all sessions while limiting comparisons to the latest ten', () => {
    const sessions = Array.from({ length: 12 }, (_, index) =>
      makeSession({
        id: `session-${index}`,
        name: `Agent ${index}`,
        created_at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        metrics: { ...makeSession().metrics, tokens_used: (index + 1) * 1000 },
      })
    );
    const inputIds = sessions.map((session) => session.id);
    render(<DashboardStats sessions={sessions} />);
    const card = screen.getByRole('group', {
      name: `Tokens Used: ${Number(78000).toLocaleString()}`,
    });
    expect(within(card).getByText('78.0K')).toBeInTheDocument();
    const list = within(card).getByRole('list', { name: 'Tokens Used by session, oldest first' });
    const values = within(list).getAllByRole('listitem');
    expect(values).toHaveLength(10);
    expect(values[0]).toHaveTextContent(`Agent 2: ${Number(3000).toLocaleString()}`);
    expect(values[9]).toHaveTextContent(`Agent 11: ${Number(12000).toLocaleString()}`);
    expect(within(list).queryByText(/^Agent 0:/)).not.toBeInTheDocument();
    expect(sessions.map((session) => session.id)).toEqual(inputIds);
  });

  it('preserves keyboard activation and selected state on the running filter', () => {
    const onStatClick = vi.fn();
    render(
      <DashboardStats sessions={[makeSession()]} activeFilter="running" onStatClick={onStatClick} />
    );
    const card = screen.getByRole('button', { name: /Active: 1/ });
    expect(card).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onStatClick).toHaveBeenCalledTimes(2);
    expect(onStatClick).toHaveBeenLastCalledWith('running');
  });

  it('announces loading instead of showing zero-valued totals', () => {
    render(<DashboardStats sessions={[]} isLoading />);
    expect(screen.getByRole('status', { name: 'Loading session metrics' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
