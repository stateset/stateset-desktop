import type { AgentSession } from '../../../types';

let fixtureCounter = 0;

/** Build an AgentSession for tests, with sensible defaults. */
export function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  fixtureCounter += 1;
  return {
    id: `sess-${fixtureCounter}`,
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
