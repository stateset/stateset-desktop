/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportSessions, exportMetricsSummary, exportRunSummary, copyToClipboard } from './export';
import type { AgentSession } from '../types';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-12345678',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    agent_type: 'support',
    status: 'running',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: false,
      custom_instructions: 'help users',
      mcp_servers: ['shopify'],
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
    },
    metrics: {
      loop_count: 12,
      tokens_used: 345,
      tool_calls: 8,
      errors: 1,
      messages_sent: 20,
      uptime_seconds: 900,
    },
    created_at: '2026-02-25T00:00:00.000Z',
    updated_at: '2026-02-26T00:00:00.000Z',
    started_at: '2026-02-25T00:01:00.000Z',
    stopped_at: null,
    ...overrides,
  };
}

describe('export helpers', () => {
  const createObjectURL = vi.fn().mockReturnValue('blob:test-url');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports sessions as CSV', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    exportSessions([makeSession()], { format: 'csv', filename: 'sessions.csv' });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('exports sessions as JSON by default filename extension', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportSessions([makeSession()], { format: 'json' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('exports metrics summary', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportMetricsSummary([
      makeSession(),
      makeSession({
        id: 'session-2',
        status: 'failed',
        metrics: {
          loop_count: 5,
          tokens_used: 100,
          tool_calls: 3,
          errors: 2,
          messages_sent: 7,
          uptime_seconds: 120,
        },
      }),
    ]);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('exports run summary in markdown', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportRunSummary(makeSession(), { format: 'md' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('exports run summary in json when format omitted', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportRunSummary(makeSession());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('copies object payload to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyToClipboard({ hello: 'world' });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }, null, 2));
  });

  it('returns false when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyToClipboard('payload');
    expect(ok).toBe(false);
  });
});
