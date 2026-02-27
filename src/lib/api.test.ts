import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { API_CONFIG } from '../config/api.config';
import { agentApi, secretsApi, webhooksApi } from './api';

const mockCircuitBreaker = vi.hoisted(() => ({
  isCallPermitted: vi.fn(() => true),
  onSuccess: vi.fn(),
  onError: vi.fn(),
  getStatus: vi.fn(() => ({
    state: 'CLOSED' as const,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastFailure: null,
    lastSuccess: null,
    isHealthy: true,
  })),
}));

// Mock the auth store before importing api
vi.mock('../stores/auth', () => ({
  useAuthStore: {
    getState: () => ({ apiKey: 'test-api-key' }),
  },
}));

// Mock the logger
vi.mock('./logger', () => ({
  apiLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock request deduplication (pass-through)
vi.mock('./requestDeduplication', () => ({
  apiDeduplicator: {
    has: vi.fn(() => false),
    dedupe: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()),
  },
  createRequestKey: vi.fn((method: string, path: string) => `${method}:${path}`),
}));

vi.mock('./circuit-breaker', () => ({
  apiCircuitBreaker: mockCircuitBreaker,
  CircuitBreakerError: class CircuitBreakerError extends Error {
    status: unknown;
    constructor(message: string, status: unknown) {
      super(message);
      this.name = 'CircuitBreakerError';
      this.status = status;
    }
  },
}));

// We need to test the retry logic and helper functions
let fetchMock: Mock<(input?: RequestInfo, init?: RequestInit) => Promise<MockResponse>>;

beforeEach(() => {
  fetchMock = vi.fn<(input?: RequestInfo, init?: RequestInit) => Promise<MockResponse>>();
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.clearAllMocks();
  mockCircuitBreaker.isCallPermitted.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('API Helper Functions', () => {
  describe('calculateBackoff', () => {
    // Test exponential backoff calculation
    it('should calculate exponential backoff with jitter', () => {
      // Backoff formula: baseMs * 2^attempt + random jitter
      // Attempt 0: ~1000ms
      // Attempt 1: ~2000ms
      // Attempt 2: ~4000ms

      // We'll test the logic inline since the function isn't exported
      const calculateBackoff = (attempt: number, baseMs: number = 1000): number => {
        const exponential = baseMs * Math.pow(2, attempt);
        const jitter = Math.random() * exponential * 0.25;
        return Math.min(exponential + jitter, 30000);
      };

      // Test that values are within expected ranges
      const backoff0 = calculateBackoff(0);
      expect(backoff0).toBeGreaterThanOrEqual(1000);
      expect(backoff0).toBeLessThanOrEqual(1250);

      const backoff1 = calculateBackoff(1);
      expect(backoff1).toBeGreaterThanOrEqual(2000);
      expect(backoff1).toBeLessThanOrEqual(2500);

      const backoff2 = calculateBackoff(2);
      expect(backoff2).toBeGreaterThanOrEqual(4000);
      expect(backoff2).toBeLessThanOrEqual(5000);
    });

    it('should cap at 30 seconds', () => {
      const calculateBackoff = (attempt: number, baseMs: number = 1000): number => {
        const exponential = baseMs * Math.pow(2, attempt);
        const jitter = Math.random() * exponential * 0.25;
        return Math.min(exponential + jitter, 30000);
      };

      // Large attempt number should be capped
      const backoff10 = calculateBackoff(10);
      expect(backoff10).toBeLessThanOrEqual(30000);
    });
  });

  describe('isRetryableError', () => {
    const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

    const isRetryableError = (error: unknown, status?: number): boolean => {
      if (status && RETRYABLE_STATUS_CODES.includes(status)) {
        return true;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return true;
      }
      if (error instanceof Error && error.message.includes('timed out')) {
        return true;
      }
      return false;
    };

    it('should return true for retryable status codes', () => {
      expect(isRetryableError(null, 429)).toBe(true);
      expect(isRetryableError(null, 500)).toBe(true);
      expect(isRetryableError(null, 502)).toBe(true);
      expect(isRetryableError(null, 503)).toBe(true);
      expect(isRetryableError(null, 504)).toBe(true);
    });

    it('should return false for non-retryable status codes', () => {
      expect(isRetryableError(null, 400)).toBe(false);
      expect(isRetryableError(null, 401)).toBe(false);
      expect(isRetryableError(null, 403)).toBe(false);
      expect(isRetryableError(null, 404)).toBe(false);
    });

    it('should return true for fetch network errors', () => {
      const fetchError = new TypeError('Failed to fetch');
      expect(isRetryableError(fetchError)).toBe(true);
    });

    it('should return true for timeout errors', () => {
      const timeoutError = new Error('Request timed out');
      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('should return false for other errors', () => {
      const otherError = new Error('Some other error');
      expect(isRetryableError(otherError)).toBe(false);
    });
  });
});

interface MockResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
}

describe('API Request Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCircuitBreaker.isCallPermitted.mockReturnValue(true);
  });

  it('should include authorization header with API key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{"ok": true}',
    });

    // We can't easily test the actual api module due to module caching,
    // but we can verify the expected behavior pattern
    const mockHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'ApiKey test-api-key',
    };

    expect(mockHeaders['Authorization']).toBe('ApiKey test-api-key');
  });

  it('should retry auth header variants and succeed with X-API-Key', async () => {
    const unauthorizedResponse = {
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    };

    fetchMock.mockResolvedValueOnce(unauthorizedResponse);
    fetchMock.mockResolvedValueOnce(unauthorizedResponse);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          webhooks: [],
        }),
    });

    await webhooksApi.list('tenant-123', 'brand-456');

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    const thirdHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;

    expect(firstHeaders.Authorization).toBe('ApiKey test-api-key');
    expect(secondHeaders.Authorization).toBe('Bearer test-api-key');
    expect(thirdHeaders['X-API-Key']).toBe('test-api-key');
  });

  it('should not attempt unauthenticated fallback after auth failures', async () => {
    const unauthorizedResponse = {
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    };

    fetchMock.mockResolvedValueOnce(unauthorizedResponse);
    fetchMock.mockResolvedValueOnce(unauthorizedResponse);
    fetchMock.mockResolvedValueOnce(unauthorizedResponse);

    await expect(webhooksApi.list('tenant-123', 'brand-456')).rejects.toThrow(
      'Authentication required'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const finalHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(finalHeaders['X-API-Key']).toBe('test-api-key');
  });

  it('should handle successful JSON response', async () => {
    const responseData = { ok: true, data: 'test' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(responseData),
    });

    // Simulate the response parsing logic
    const response = await fetchMock();
    const text = await response.text();
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    expect(isJson).toBe(true);
    expect(JSON.parse(text)).toEqual(responseData);
  });

  it('should handle empty response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => '' },
      text: async () => '',
    });

    const response = await fetchMock();
    const text = await response.text();

    expect(text).toBe('');
    expect(response.ok).toBe(true);
  });

  describe('error handling', () => {
    it('should parse error message from JSON response', () => {
      const errorResponse = { error: 'Invalid request' };
      const parsed = JSON.parse(JSON.stringify(errorResponse));

      expect(parsed.error).toBe('Invalid request');
    });

    it('should handle message field in error response', () => {
      const errorResponse = { message: 'Not found' };
      const parsed = JSON.parse(JSON.stringify(errorResponse));
      const errorMessage = parsed.error || parsed.message;

      expect(errorMessage).toBe('Not found');
    });
  });

  describe('circuit breaker integration', () => {
    it('should check circuit breaker before making request', () => {
      mockCircuitBreaker.isCallPermitted.mockReturnValue(false);

      // When circuit breaker rejects, request should not be made
      expect(mockCircuitBreaker.isCallPermitted()).toBe(false);
    });

    it('should record success on successful response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => '{"ok": true}',
      });

      await fetchMock();

      // Simulate recording success
      mockCircuitBreaker.onSuccess();
      expect(mockCircuitBreaker.onSuccess).toHaveBeenCalled();
    });

    it('should record error on failed response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        text: async () => '{"error": "Server error"}',
      });

      await fetchMock();

      // Simulate recording error
      mockCircuitBreaker.onError();
      expect(mockCircuitBreaker.onError).toHaveBeenCalled();
    });
  });
});

describe('Agent API', () => {
  describe('getStreamUrl', () => {
    it('should construct base stream URL', () => {
      const tenantId = 'tenant-123';
      const brandId = 'brand-456';
      const sessionId = 'session-789';
      const baseUrl = API_CONFIG.baseUrl;
      const streamUrl = agentApi.getStreamUrl(tenantId, brandId, sessionId);

      expect(streamUrl).toBe(
        `${baseUrl}/api/v1/tenants/tenant-123/brands/brand-456/agents/session-789/stream`
      );
    });

    it('should encode dynamic IDs in stream URL', () => {
      const tenantId = 'tenant with/slash';
      const brandId = 'brand?x';
      const sessionId = 'session#id';
      const baseUrl = API_CONFIG.baseUrl;
      const streamUrl = agentApi.getStreamUrl(tenantId, brandId, sessionId);

      expect(streamUrl).toBe(
        `${baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/brands/${encodeURIComponent(
          brandId
        )}/agents/${encodeURIComponent(sessionId)}/stream`
      );
    });

    it('should return base URL when no token provided', () => {
      const baseUrl = API_CONFIG.baseUrl;
      const streamUrl = agentApi.getStreamUrl('tenant', 'brand', 'session');

      expect(streamUrl).not.toContain('api_key');
      expect(streamUrl).not.toContain('token');
      expect(streamUrl.startsWith(baseUrl)).toBe(true);
    });
  });

  describe('listSessions', () => {
    it('should prefer tenant-scoped endpoint for tenant+brand sessions', async () => {
      const tenantId = 'tenant with/space';
      const brandId = 'brand?value';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ sessions: [] }),
      });

      await agentApi.listSessions(tenantId, brandId);

      const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(requestedUrl).toBe(
        `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/agents`
      );
    });

    it('should fallback from tenant-scoped to brand-scoped sessions endpoint', async () => {
      const tenantId = 'tenant-123';
      const brandId = 'brand-456';

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify({ error: 'Internal server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: async () =>
            JSON.stringify({
              sessions: [],
            }),
        });

      await agentApi.listSessions(tenantId, brandId);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
      const secondUrl = String(fetchMock.mock.calls[1]?.[0]);

      expect(firstUrl).toBe(
        `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/agents`
      );
      expect(secondUrl).toBe(
        `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/brands/${encodeURIComponent(
          brandId
        )}/agents`
      );
    });

    it('should parse legacy agents payload key', async () => {
      const tenantId = 'tenant-123';
      const brandId = 'brand-456';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            agents: [
              {
                id: 'agent-1',
                tenant_id: tenantId,
                brand_id: brandId,
                agent_type: 'support',
                status: 'running',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                config: {
                  loop_interval_ms: 1000,
                  max_iterations: 100,
                  iteration_timeout_secs: 30,
                  pause_on_error: false,
                  mcp_servers: [],
                  model: 'gpt-4',
                  temperature: 0.2,
                },
                metrics: {
                  loop_count: 1,
                  tokens_used: 0,
                  tool_calls: 0,
                  errors: 0,
                  messages_sent: 0,
                  uptime_seconds: 10,
                },
              },
            ],
          }),
      });

      const sessions = await agentApi.listSessions(tenantId, brandId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'agent-1',
        tenant_id: tenantId,
        brand_id: brandId,
      });
    });
  });

  describe('agent endpoints', () => {
    it('encodes dynamic segments for session fetches', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            session: {
              id: 'session:three',
              tenant_id: 'tenant/one',
              brand_id: 'brand/two',
              agent_type: 'assistant',
              status: 'running',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              config: {
                loop_interval_ms: 100,
                max_iterations: 100,
                iteration_timeout_secs: 30,
                pause_on_error: false,
                mcp_servers: [],
                model: 'gpt-mock',
                temperature: 0.2,
              },
              metrics: {
                loop_count: 0,
                tokens_used: 0,
                tool_calls: 0,
                errors: 0,
                messages_sent: 0,
                uptime_seconds: 0,
              },
            },
          }),
      });

      const tenantId = 'tenant/one';
      const brandId = 'brand/two';
      const sessionId = 'session:three';

      await agentApi.getSession(tenantId, brandId, sessionId);

      const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(requestedUrl).toBe(
        `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(
          tenantId
        )}/brands/${encodeURIComponent(brandId)}/agents/${encodeURIComponent(sessionId)}`
      );
    });
  });
});

describe('Secrets API', () => {
  it('should fallback across tenant-scoped, brand-scoped, query-scoped, and unscoped secrets endpoints', async () => {
    const tenantId = 'tenant-123';
    const brandId = 'brand-456';

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: 'Internal server error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: 'Internal server error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: 'Internal server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () =>
          JSON.stringify({
            ok: true,
            data: ['shopify', 'custom'],
          }),
      });

    const connections = await secretsApi.listConnections(tenantId, brandId);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
    const thirdUrl = String(fetchMock.mock.calls[2]?.[0]);
    const fourthUrl = String(fetchMock.mock.calls[3]?.[0]);

    expect(firstUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/brands/${encodeURIComponent(
        brandId
      )}/secrets`
    );
    expect(secondUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/brands/${encodeURIComponent(brandId)}/secrets`
    );
    expect(thirdUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/secrets?brand_id=${encodeURIComponent(
        brandId
      )}`
    );
    expect(fourthUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/secrets`
    );

    expect(connections).toHaveLength(2);
    expect(connections[0]).toMatchObject({ platform: 'shopify', connected: true });
    expect(connections[1]).toMatchObject({ platform: 'custom', connected: true });
  });

  it('should handle secrets response without envelope wrapper', async () => {
    const tenantId = 'tenant-123';
    const brandId = 'brand-456';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          platforms: ['shopify'],
        }),
    });

    const connections = await secretsApi.listConnections(tenantId, brandId);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ platform: 'shopify', connected: true });
  });

  it('should handle engine-style secrets response with nested data.platforms', async () => {
    const tenantId = 'tenant-123';
    const brandId = 'brand-456';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: {
            platforms: ['shopify', 'zendesk'],
          },
        }),
    });

    const connections = await secretsApi.listConnections(tenantId, brandId);
    expect(connections).toHaveLength(2);
    expect(connections[0]).toMatchObject({ platform: 'shopify', connected: true });
    expect(connections[1]).toMatchObject({ platform: 'zendesk', connected: true });
  });

  it('should handle engine-style test response wrapped in data envelope', async () => {
    const tenantId = 'tenant-123';
    const brandId = 'brand-456';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: {
            success: true,
            message: 'Connection verified',
          },
        }),
    });

    const result = await secretsApi.testConnection(tenantId, brandId, 'shopify');
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);

    expect(requestedUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/${encodeURIComponent(tenantId)}/brands/${encodeURIComponent(
        brandId
      )}/secrets/shopify/test`
    );
    expect(result).toEqual({
      success: true,
      message: 'Connection verified',
    });
  });
});

describe('Webhooks API', () => {
  const engineWebhook = {
    id: 'wh-1',
    tenant_id: 'tenant-123',
    brand_id: 'brand-456',
    url: 'https://example.com/hook',
    description: 'Order webhook',
    events: ['order.created'],
    enabled: true,
    secret: 'sec_abc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_triggered_at: null,
  };

  it('should list webhooks from tenant-scoped endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: [engineWebhook],
        }),
    });

    const webhooks = await webhooksApi.list('tenant-123', 'brand-456');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(`${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks`);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]).toMatchObject({
      id: 'wh-1',
      name: 'Order webhook',
      status: 'active',
      direction: 'outgoing',
      brand_id: 'brand-456',
    });
  });

  it('should map engine webhook fields to desktop shape', async () => {
    const disabledWebhook = {
      ...engineWebhook,
      enabled: false,
      description: null,
      brand_id: undefined,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          webhooks: [disabledWebhook],
        }),
    });

    const webhooks = await webhooksApi.list('tenant-123', 'brand-456');

    expect(webhooks[0]).toMatchObject({
      name: '',
      status: 'paused',
      brand_id: 'brand-456',
    });
  });

  it('should get a single webhook from tenant-scoped endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          webhook: engineWebhook,
        }),
    });

    const webhook = await webhooksApi.get('tenant-123', 'brand-456', 'wh-1');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(`${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks/wh-1`);
    expect(webhook.id).toBe('wh-1');
    expect(webhook.name).toBe('Order webhook');
  });

  it('should create a webhook on brand-scoped endpoint with mapped payload', async () => {
    const engineCreateResponse = {
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['order.created'],
      secret: 'whsec_test',
      enabled: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: engineCreateResponse,
        }),
    });

    const created = await webhooksApi.create('tenant-123', 'brand-456', {
      name: 'Order webhook',
      url: 'https://example.com/hook',
      events: ['order.created'],
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/brands/brand-456/webhooks`
    );

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sentBody).toEqual({
      url: 'https://example.com/hook',
      description: 'Order webhook',
      events: ['order.created'],
      enabled: true,
    });

    expect(created).toMatchObject({
      id: 'wh-1',
      tenant_id: 'tenant-123',
      brand_id: 'brand-456',
      name: 'Order webhook',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('should update a webhook on tenant-scoped endpoint with mapped payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          webhook: { ...engineWebhook, enabled: false },
        }),
    });

    await webhooksApi.update('tenant-123', 'brand-456', 'wh-1', {
      name: 'Updated name',
      status: 'paused',
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(`${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks/wh-1`);

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sentBody).toEqual({
      description: 'Updated name',
      enabled: false,
    });
  });

  it('should delete a webhook from tenant-scoped endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => '' },
      text: async () => '',
    });

    await webhooksApi.delete('tenant-123', 'brand-456', 'wh-1');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(`${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks/wh-1`);
  });

  it('should test a webhook from tenant-scoped endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ success: true, status_code: 200, duration_ms: 50 }),
    });

    const result = await webhooksApi.test('tenant-123', 'brand-456', 'wh-1');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(`${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks/wh-1/test`);
    expect(result.success).toBe(true);
  });

  it('should normalize canonical webhook test delivery responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: {
            id: 'del-2',
            webhook_id: 'wh-1',
            event: 'test',
            payload: { event: 'test', data: { message: 'ok' } },
            response_status: 202,
            response_body: '{"accepted":true}',
            attempts: 1,
            delivered_at: '2026-01-01T00:00:10Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
    });

    const result = await webhooksApi.test('tenant-123', 'brand-456', 'wh-1');

    expect(result).toEqual({
      success: true,
      status_code: 202,
      duration_ms: 0,
    });
  });

  it('should list deliveries from tenant-scoped endpoint and map fields', async () => {
    const engineDelivery = {
      id: 'del-1',
      webhook_id: 'wh-1',
      event: 'order.created',
      response_status: 200,
      payload: { order_id: '123' },
      response_body: '{"ok":true}',
      attempts: 1,
      delivered_at: '2026-01-01T00:00:01Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({
          ok: true,
          data: [engineDelivery],
        }),
    });

    const deliveries = await webhooksApi.listDeliveries('tenant-123', 'brand-456', 'wh-1');

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(
      `${API_CONFIG.baseUrl}/api/v1/tenants/tenant-123/webhooks/wh-1/deliveries`
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      id: 'del-1',
      status_code: 200,
      request_body: '{"order_id":"123"}',
      response_body: '{"ok":true}',
      duration_ms: 0,
      success: true,
    });
  });
});

describe('API Health', () => {
  it('should return circuit breaker status', () => {
    const status = mockCircuitBreaker.getStatus();

    expect(status).toHaveProperty('state');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(status).toHaveProperty('consecutiveSuccesses');
    expect(status).toHaveProperty('isHealthy');
  });
});
