import { describe, it, expect } from 'vitest';
import {
  AgentSessionStatusSchema,
  AgentSessionConfigSchema,
  AgentSessionMetricsSchema,
  AgentSessionSchema,
  TenantSchema,
  BrandSchema,
  SessionsListResponseSchema,
  SessionResponseSchema,
  BrandsListResponseSchema,
  BrandResponseSchema,
  StreamTokenResponseSchema,
  validateResponse,
} from './schemas';
import { ZodError } from 'zod';

// ── Fixtures ────────────────────────────────────────────────────────────

const validConfig = {
  agent_type: 'interactive',
  loop_interval_ms: 5000,
  max_iterations: 100,
  iteration_timeout_secs: 30,
  pause_on_error: true,
  custom_instructions: 'Be helpful',
  mcp_servers: ['server-1'],
  model: 'claude-sonnet-4-6',
  temperature: 0.7,
};

const validMetrics = {
  loop_count: 10,
  tokens_used: 5000,
  tool_calls: 3,
  errors: 0,
  messages_sent: 7,
  uptime_seconds: 120,
};

const validSession = {
  id: 'sess-1',
  tenant_id: 'tenant-1',
  brand_id: 'brand-1',
  agent_type: 'interactive',
  name: 'Test Agent',
  tags: ['prod'],
  status: 'running',
  config: validConfig,
  metrics: validMetrics,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T01:00:00Z',
  started_at: '2026-01-01T00:30:00Z',
};

const validBrand = {
  id: 'brand-1',
  tenant_id: 'tenant-1',
  slug: 'acme',
  name: 'Acme Corp',
  support_platform: 'zendesk',
  ecommerce_platform: 'shopify',
  config: { key: 'value' },
  mcp_servers: ['server-1'],
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
};

// ── AgentSessionStatus ──────────────────────────────────────────────────

describe('AgentSessionStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const status of ['starting', 'running', 'paused', 'stopping', 'stopped', 'failed']) {
      expect(AgentSessionStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects invalid status', () => {
    expect(() => AgentSessionStatusSchema.parse('unknown')).toThrow(ZodError);
  });
});

// ── AgentSessionConfig ──────────────────────────────────────────────────

describe('AgentSessionConfigSchema', () => {
  it('parses valid config', () => {
    const result = AgentSessionConfigSchema.parse(validConfig);
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('accepts config without optional fields', () => {
    const minimal = { ...validConfig };
    delete (minimal as Record<string, unknown>).agent_type;
    delete (minimal as Record<string, unknown>).custom_instructions;
    const result = AgentSessionConfigSchema.parse(minimal);
    expect(result.agent_type).toBeUndefined();
    expect(result.custom_instructions).toBeUndefined();
  });

  it('applies defaults for missing fields', () => {
    const { model: _model, ...noModel } = validConfig;
    const result = AgentSessionConfigSchema.parse(noModel);
    expect(result.model).toBe('claude-sonnet-4-6'); // default value
  });

  it('rejects config with wrong type', () => {
    expect(() =>
      AgentSessionConfigSchema.parse({ ...validConfig, loop_interval_ms: 'not a number' })
    ).toThrow(ZodError);
  });
});

// ── AgentSessionMetrics ─────────────────────────────────────────────────

describe('AgentSessionMetricsSchema', () => {
  it('parses valid metrics', () => {
    const result = AgentSessionMetricsSchema.parse(validMetrics);
    expect(result.loop_count).toBe(10);
  });

  it('applies defaults for missing fields', () => {
    const { loop_count: _, ...noLoopCount } = validMetrics;
    const result = AgentSessionMetricsSchema.parse(noLoopCount);
    expect(result.loop_count).toBe(0); // default value
  });
});

// ── AgentSession ────────────────────────────────────────────────────────

describe('AgentSessionSchema', () => {
  it('parses valid session', () => {
    const result = AgentSessionSchema.parse(validSession);
    expect(result.id).toBe('sess-1');
    expect(result.status).toBe('running');
  });

  it('accepts session without optional fields', () => {
    const minimal = { ...validSession };
    delete (minimal as Record<string, unknown>).name;
    delete (minimal as Record<string, unknown>).tags;
    delete (minimal as Record<string, unknown>).started_at;
    delete (minimal as Record<string, unknown>).stopped_at;
    const result = AgentSessionSchema.parse(minimal);
    expect(result.name).toBeUndefined();
    expect(result.tags).toEqual([]); // null/undefined tags transform to []
  });

  it('passes through extra fields from newer API versions', () => {
    const extended = { ...validSession, new_field: 'future' };
    // Should not throw — passthrough mode via .parse()
    const result = AgentSessionSchema.parse(extended);
    expect(result.id).toBe('sess-1');
  });

  it('rejects session with invalid status', () => {
    expect(() => AgentSessionSchema.parse({ ...validSession, status: 'exploded' })).toThrow(
      ZodError
    );
  });
});

// ── Brand ───────────────────────────────────────────────────────────────

describe('BrandSchema', () => {
  it('parses valid brand', () => {
    const result = BrandSchema.parse(validBrand);
    expect(result.slug).toBe('acme');
  });

  it('rejects brand with missing id', () => {
    const { id: _, ...noId } = validBrand;
    expect(() => BrandSchema.parse(noId)).toThrow(ZodError);
  });
});

// ── Tenant ──────────────────────────────────────────────────────────────

describe('TenantSchema', () => {
  it('parses valid tenant', () => {
    const result = TenantSchema.parse({
      id: 't-1',
      name: 'Acme',
      slug: 'acme',
      tier: 'pro',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(result.tier).toBe('pro');
  });

  it('rejects invalid tier', () => {
    expect(() =>
      TenantSchema.parse({
        id: 't-1',
        name: 'Acme',
        slug: 'acme',
        tier: 'ultra',
        created_at: '2026-01-01T00:00:00Z',
      })
    ).toThrow(ZodError);
  });
});

// ── Response wrappers ───────────────────────────────────────────────────

describe('SessionsListResponseSchema', () => {
  it('parses a valid list response', () => {
    const result = SessionsListResponseSchema.parse({
      ok: true,
      sessions: [validSession],
    });
    expect(result.sessions).toHaveLength(1);
  });

  it('accepts empty sessions list', () => {
    const result = SessionsListResponseSchema.parse({ ok: true, sessions: [] });
    expect(result.sessions).toEqual([]);
  });
});

describe('SessionResponseSchema', () => {
  it('parses a valid single-session response', () => {
    const result = SessionResponseSchema.parse({ ok: true, session: validSession });
    expect(result.session.id).toBe('sess-1');
  });
});

describe('BrandsListResponseSchema', () => {
  it('parses a valid brands list response', () => {
    const result = BrandsListResponseSchema.parse({ ok: true, brands: [validBrand] });
    expect(result.brands).toHaveLength(1);
  });
});

describe('BrandResponseSchema', () => {
  it('parses a valid brand response', () => {
    const result = BrandResponseSchema.parse({ ok: true, brand: validBrand });
    expect(result.brand.name).toBe('Acme Corp');
  });
});

describe('StreamTokenResponseSchema', () => {
  it('parses response with token', () => {
    const result = StreamTokenResponseSchema.parse({ ok: true, token: 'abc123' });
    expect(result.token).toBe('abc123');
  });

  it('parses response without token', () => {
    const result = StreamTokenResponseSchema.parse({ ok: true });
    expect(result.token).toBeUndefined();
  });
});

// ── validateResponse ────────────────────────────────────────────────────

describe('validateResponse', () => {
  it('returns parsed data on success', () => {
    const data = { ok: true, sessions: [validSession] };
    const result = validateResponse(SessionsListResponseSchema, data);
    expect(result.sessions[0].id).toBe('sess-1');
  });

  it('throws ZodError on invalid data', () => {
    expect(() =>
      validateResponse(SessionsListResponseSchema, { ok: true, sessions: 'bad' })
    ).toThrow(ZodError);
  });

  it('throws ZodError on null input', () => {
    expect(() => validateResponse(SessionResponseSchema, null)).toThrow(ZodError);
  });
});
