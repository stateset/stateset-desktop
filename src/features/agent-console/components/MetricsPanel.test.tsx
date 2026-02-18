/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetricsPanel } from './MetricsPanel';
import type { AgentSession, AgentSessionMetrics } from '../../../types';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    organization_id: 'org-1',
    status: 'running',
    current_sandbox_id: 'sandbox-1',
    name: 'Test Session',
    description: null,
    started_at: '2026-02-15T12:00:00Z',
    updated_at: '2026-02-15T12:05:00Z',
    budget_config: null,
    sandbox_config: null,
    ...overrides,
  } as AgentSession;
}

function makeMetrics(overrides: Partial<AgentSessionMetrics> = {}): AgentSessionMetrics {
  return {
    loop_count: 10,
    tokens_used: 5000,
    tool_calls: 8,
    errors: 1,
    messages_sent: 15,
    uptime_seconds: 300,
    estimated_cost_cents: 1234,
    input_tokens: 5000,
    output_tokens: 2000,
    ...overrides,
  } as AgentSessionMetrics;
}

const defaultProps = {
  session: makeSession(),
  currentStatus: 'running' as const,
  streamError: null,
  showLogs: false,
  logs: [],
  onClearLogs: vi.fn(),
  onExportSummary: vi.fn(),
};

describe('MetricsPanel', () => {
  it('renders cost metric card', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics({ estimated_cost_cents: 1234 })}
      />
    );

    expect(screen.getByText('$12.3400')).toBeInTheDocument();
    expect(screen.getByText('Est. Cost')).toBeInTheDocument();
  });

  it('renders input and output token cards', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics({ tokens_used: 3000, input_tokens: 7500, output_tokens: 2500 })}
      />
    );

    expect(screen.getByText('7,500')).toBeInTheDocument();
    expect(screen.getByText('2,500')).toBeInTheDocument();
    expect(screen.getByText('Input Tokens')).toBeInTheDocument();
    expect(screen.getByText('Output Tokens')).toBeInTheDocument();
  });

  it('renders dash for missing token data', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics({
          estimated_cost_cents: undefined as unknown as number,
          input_tokens: undefined as unknown as number,
          output_tokens: undefined as unknown as number,
        })}
      />
    );

    // Three dashes: cost, input tokens, output tokens
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('renders loop count, tokens used, tool calls, and errors', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics({
          loop_count: 42,
          tokens_used: 9999,
          tool_calls: 17,
          errors: 3,
        })}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('9,999')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders stream error when present', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics()}
        streamError="Connection lost"
      />
    );

    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });

  it('calls onExportSummary when export button clicked', () => {
    const onExportSummary = vi.fn();
    render(
      <MetricsPanel
        {...defaultProps}
        currentMetrics={makeMetrics()}
        onExportSummary={onExportSummary}
      />
    );

    fireEvent.click(screen.getByLabelText('Export run summary'));
    expect(onExportSummary).toHaveBeenCalledOnce();
  });

  it('renders run summary with status and duration', () => {
    render(
      <MetricsPanel
        {...defaultProps}
        currentStatus="running"
        currentMetrics={makeMetrics({ uptime_seconds: 125 })}
      />
    );

    expect(screen.getByText('Run Summary')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });
});
