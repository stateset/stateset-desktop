import type {
  AgentSession,
  AgentSessionConfig,
  Brand,
  PlatformConnection,
  Webhook,
  WebhookDelivery,
} from '../types';
import { useAuthStore } from '../stores/auth';
import { apiCircuitBreaker, CircuitBreakerError } from './circuit-breaker';
import { API_CONFIG } from '../config/api.config';
import { apiDeduplicator, createRequestKey } from './requestDeduplication';
import { apiLogger } from './logger';
import { recordApiCall } from './metrics';
import {
  SessionsListResponseSchema,
  AgentsListResponseSchema,
  SessionResponseSchema,
  BrandsListResponseSchema,
  BrandResponseSchema,
  StreamTokenResponseSchema,
  WebhooksListResponseSchema,
  WebhookResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookTestResponseSchema,
  SecretsListResponseSchema,
  SecretsTestResponseSchema,
  validateResponse,
  unwrapDataEnvelope,
} from './schemas';
import type { z } from 'zod';
import type { EngineWebhookSchema, EngineWebhookDeliverySchema } from './schemas';

const API_URL = API_CONFIG.baseUrl.replace(/\/+$/, '');
const API_V1_PATH = '/api/v1';

function buildPath(...segments: string[]): string {
  return `${API_V1_PATH}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value);
}

// Helper to get auth headers
type AuthHeaderCandidate = {
  headers: Record<string, string>;
  description: string;
};

function getStoredApiKey(): string | null {
  const apiKey = useAuthStore.getState().apiKey;
  if (typeof apiKey !== 'string') {
    return null;
  }
  const trimmed = apiKey.trim();
  return trimmed || null;
}

function buildAuthHeaderCandidates(
  apiKey: string | null,
  allowUnauthenticatedFallback: boolean = false
): AuthHeaderCandidate[] {
  if (!apiKey) {
    return [{ headers: {}, description: 'No API key' }];
  }

  const candidates: AuthHeaderCandidate[] = [];
  const seenSignatures = new Set<string>();

  const addCandidate = (description: string, headers: Record<string, string>): void => {
    const normalized = JSON.stringify(
      Object.entries(headers)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {})
    );

    if (seenSignatures.has(normalized)) {
      return;
    }
    seenSignatures.add(normalized);
    candidates.push({ headers, description });
  };

  addCandidate('ApiKey Authorization', { Authorization: `ApiKey ${apiKey}` });
  addCandidate('Bearer Authorization', { Authorization: `Bearer ${apiKey}` });
  addCandidate('X-API-Key', { 'X-API-Key': apiKey });

  if (allowUnauthenticatedFallback) {
    addCandidate('No Authorization', {});
  }
  return candidates;
}

function shouldSendJsonContentType(body: RequestInit['body']): boolean {
  if (body === undefined || body === null) {
    return false;
  }
  if (typeof body === 'string') {
    return body.length > 0;
  }
  if (body instanceof FormData) {
    return false;
  }
  if (body instanceof URLSearchParams) {
    return false;
  }
  return true;
}

function getAuthCandidateFromHeaders(headers: Record<string, string>): AuthHeaderCandidate | null {
  if (headers.Authorization) {
    return {
      headers: { Authorization: headers.Authorization },
      description: 'Explicit Authorization',
    };
  }
  if (headers['X-API-Key']) {
    return { headers: { 'X-API-Key': headers['X-API-Key'] }, description: 'Explicit X-API-Key' };
  }
  if (headers['X-Api-Key']) {
    return { headers: { 'X-Api-Key': headers['X-Api-Key'] }, description: 'Explicit X-Api-Key' };
  }
  return null;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const copy: Record<string, string> = {};
    headers.forEach((value, key) => {
      copy[key] = value;
    });
    return copy;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  return { ...headers } as Record<string, string>;
}

function buildRequestHeaders(
  authHeader: AuthHeaderCandidate,
  headers: HeadersInit | undefined | undefined,
  body: RequestInit['body']
): Record<string, string> {
  const normalizedHeaders = normalizeHeaders(headers);
  delete normalizedHeaders.Authorization;
  delete normalizedHeaders.authorization;

  const requestHeaders: Record<string, string> = {
    ...normalizedHeaders,
  };

  Object.entries(authHeader.headers).forEach(([headerName, headerValue]) => {
    requestHeaders[headerName] = headerValue;
  });

  if (shouldSendJsonContentType(body) && !('Content-Type' in requestHeaders)) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  return requestHeaders;
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  maxRetries?: number;
  skipRetry?: boolean;
  skipCircuitBreaker?: boolean;
  retryOn?: 'safe' | 'all';
  allowUnauthenticatedFallback?: boolean;
};

// Status codes that are retryable
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const RETRY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Calculate exponential backoff with jitter
function calculateBackoff(attempt: number, baseMs: number = 1000): number {
  // Exponential: 1s, 2s, 4s...
  const exponential = baseMs * Math.pow(2, attempt);
  // Add jitter (up to 25% of the delay)
  const jitter = Math.random() * exponential * 0.25;
  return Math.min(exponential + jitter, 30000); // Cap at 30 seconds
}

// Sleep helper
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Check if an error is retryable
function isRetryableError(error: unknown, status?: number): boolean {
  if (status && RETRYABLE_STATUS_CODES.includes(status)) {
    return true;
  }
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  // Timeout errors are retryable
  if (error instanceof Error && error.message.includes('timed out')) {
    return true;
  }
  return false;
}

function shouldCountCircuitBreakerFailure(status?: number): boolean {
  if (typeof status !== 'number') {
    return true;
  }
  return status >= 500 || status === 429;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!(error && typeof error === 'object')) {
    return undefined;
  }

  if ('status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }

  return undefined;
}

function getErrorRetryCount(error: unknown): number | undefined {
  if (!(error && typeof error === 'object')) {
    return undefined;
  }

  if ('retryCount' in error) {
    const retryCount = (error as { retryCount?: unknown }).retryCount;
    return typeof retryCount === 'number' ? retryCount : undefined;
  }

  return undefined;
}

function getBrandSelectionState(): {
  brands: Brand[];
  currentBrand: Brand | null;
} {
  const authState = useAuthStore.getState() as {
    brands?: unknown;
    currentBrand?: Brand | null;
  };

  const brandsValue = authState.brands;
  const brands = Array.isArray(brandsValue) ? (brandsValue as Brand[]) : [];
  const currentBrand = authState.currentBrand ?? null;

  return { brands, currentBrand };
}

function getResolvedBrandId(
  brandId: string | undefined,
  allowFallback: boolean = false
): string | undefined {
  const { brands, currentBrand } = getBrandSelectionState();

  if (!brands.length) {
    return brandId;
  }

  const enabledBrands = brands.filter((brand) => brand.enabled);
  if (enabledBrands.length === 0) {
    return undefined;
  }

  if (brandId) {
    const explicitBrand = enabledBrands.find((brand) => brand.id === brandId);
    if (explicitBrand) {
      return explicitBrand.id;
    }

    if (!allowFallback) {
      return undefined;
    }
  }

  if (!allowFallback) {
    return undefined;
  }

  if (currentBrand?.id) {
    const currentBrandMatch = enabledBrands.find((brand) => brand.id === currentBrand.id);
    if (currentBrandMatch) {
      return currentBrandMatch.id;
    }
  }

  return enabledBrands[0]?.id;
}

function getRequiredBrandId(brandId: string | undefined): string {
  const resolvedBrandId = getResolvedBrandId(brandId, false);
  if (!resolvedBrandId) {
    throw new Error('No brand selected.');
  }
  return resolvedBrandId;
}

function parseSessionsResponsePayload(raw: unknown): AgentSession[] {
  const sessionsResult = SessionsListResponseSchema.safeParse(raw);
  if (sessionsResult.success) {
    return sessionsResult.data.sessions;
  }

  const agentsResult = AgentsListResponseSchema.safeParse(raw);
  if (agentsResult.success) {
    return agentsResult.data.agents;
  }

  throw sessionsResult.error;
}

function shouldFallbackToBrandScopedAgentsPath(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (status === undefined) {
    return true;
  }

  if (status === 401 || status === 403) {
    return false;
  }

  return true;
}

function getTenantAgentSessionPaths(tenantId: string, brandId?: string): string[] {
  if (!brandId) {
    return [buildPath('tenants', tenantId, 'agents')];
  }

  return [
    buildPath('tenants', tenantId, 'agents'),
    buildPath('tenants', tenantId, 'brands', brandId, 'agents'),
  ];
}

function getBrandResourcePaths(tenantId: string, brandId: string, resource: string): string[] {
  return [
    buildPath('tenants', tenantId, 'brands', brandId, resource),
    buildPath('brands', brandId, resource),
    `${buildPath('tenants', tenantId, resource)}?brand_id=${encodeQueryValue(brandId)}`,
    buildPath('tenants', tenantId, resource),
  ];
}

async function fetchWithFallbackPaths<T>(
  paths: string[],
  parser: (raw: unknown) => T,
  shouldAttemptFallback: (error: unknown) => boolean = shouldFallbackToBrandScopedAgentsPath
): Promise<T> {
  let lastError: unknown;

  for (const [index, path] of paths.entries()) {
    try {
      const raw = await apiRequest<unknown>(path, { skipRetry: true });
      return parser(raw);
    } catch (error) {
      lastError = error;

      if (index + 1 >= paths.length) {
        break;
      }

      if (!shouldAttemptFallback(error)) {
        break;
      }
    }
  }

  throw lastError as Error;
}

interface ApiResult<T> {
  data: T;
  status: number;
  retryCount: number;
}

function extractExplicitApiKeyHeader(
  headers: Record<string, string>
): { headers: Record<string, string>; description: string } | null {
  if (headers['X-API-Key']) {
    return { headers: { 'X-API-Key': headers['X-API-Key'] }, description: 'Explicit X-API-Key' };
  }
  if (headers['X-Api-Key']) {
    return { headers: { 'X-API-Key': headers['X-Api-Key'] }, description: 'Explicit X-Api-Key' };
  }
  return null;
}

// Core fetch logic with retry and circuit breaker
async function apiRequestInternal<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult<T>> {
  const {
    timeoutMs = 15000,
    maxRetries = 3,
    skipRetry = false,
    skipCircuitBreaker = false,
    retryOn = 'safe',
    allowUnauthenticatedFallback = false,
    ...fetchOptions
  } = options;

  // Check circuit breaker first (unless skipped)
  if (!skipCircuitBreaker && !apiCircuitBreaker.isCallPermitted()) {
    throw new CircuitBreakerError(
      'Service temporarily unavailable. Please try again later.',
      apiCircuitBreaker.getStatus()
    );
  }

  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const allowRetry = !skipRetry && (retryOn === 'all' || RETRY_SAFE_METHODS.has(method));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Add delay for retries (not first attempt)
    if (attempt > 0) {
      const delay = calculateBackoff(attempt - 1);
      apiLogger.warn(`Retry attempt ${attempt}/${maxRetries} for ${method} ${path}`, {
        delayMs: Math.round(delay),
        lastStatus,
      });
      await sleep(delay);

      // Re-check circuit breaker before retry
      if (!skipCircuitBreaker && !apiCircuitBreaker.isCallPermitted()) {
        throw new CircuitBreakerError(
          'Service temporarily unavailable. Please try again later.',
          apiCircuitBreaker.getStatus()
        );
      }
    }

    const controller = fetchOptions.signal ? null : new AbortController();
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const requestedApiKey = getStoredApiKey();
      const explicitHeaders = normalizeHeaders(fetchOptions.headers);
      const explicitApiKeyHeader = extractExplicitApiKeyHeader(explicitHeaders);
      const explicitAuthCandidate =
        getAuthCandidateFromHeaders(explicitHeaders) ?? explicitApiKeyHeader;

      const authHeaderCandidates = explicitAuthCandidate
        ? [explicitAuthCandidate]
        : buildAuthHeaderCandidates(requestedApiKey, allowUnauthenticatedFallback);
      let response: Response | null = null;

      for (let candidateIndex = 0; candidateIndex < authHeaderCandidates.length; candidateIndex++) {
        const authHeader = authHeaderCandidates[candidateIndex];
        const candidateResponse = await fetch(`${API_URL}${path}`, {
          ...fetchOptions,
          signal: fetchOptions.signal ?? controller?.signal,
          headers: buildRequestHeaders(authHeader, fetchOptions.headers, fetchOptions.body),
        });
        response = candidateResponse;

        if (candidateResponse.ok) {
          break;
        }

        lastStatus = candidateResponse.status;
        const isAuthError = lastStatus === 401 || lastStatus === 403;
        if (isAuthError && candidateIndex < authHeaderCandidates.length - 1) {
          void candidateResponse.body?.cancel();
          continue;
        }
        break;
      }

      if (!response) {
        throw new Error('Request failed to receive response');
      }

      lastStatus = response.status;
      const contentType = response.headers.get('content-type') || '';
      const bodyText = await response.text();
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        // Extract raw detail for logging but expose only safe messages to UI
        const rawDetail = (() => {
          if (!isJson || !bodyText) {
            return bodyText || undefined;
          }
          try {
            const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
            return parsed.error || parsed.message || undefined;
          } catch {
            return bodyText || undefined;
          }
        })();

        const safeMessages: Record<number, string> = {
          400: 'Bad request',
          401: 'Authentication required',
          403: 'Access denied',
          404: 'Not found',
          409: 'Conflict',
          422: 'Validation error',
          429: 'Too many requests — please try again later',
          500: 'Internal server error',
          502: 'Service temporarily unavailable',
          503: 'Service temporarily unavailable',
          504: 'Request timed out',
        };
        const errorMessage = safeMessages[response.status] ?? `HTTP ${response.status}`;

        const error = new Error(errorMessage);
        (error as Error & { status: number; detail?: string; retryCount?: number }).status =
          response.status;
        (error as Error & { retryCount?: number }).retryCount = attempt;
        if (rawDetail) {
          (error as Error & { detail?: string }).detail = rawDetail;
        }
        lastError = error;

        // Check if we should retry
        if (allowRetry && attempt < maxRetries && isRetryableError(error, response.status)) {
          continue;
        }

        throw error;
      }

      // Success - record with circuit breaker
      if (!skipCircuitBreaker) {
        apiCircuitBreaker.onSuccess();
      }

      if (!bodyText) {
        return { data: undefined as T, status: response.status, retryCount: attempt };
      }

      if (isJson) {
        return { data: JSON.parse(bodyText) as T, status: response.status, retryCount: attempt };
      }

      return { data: bodyText as unknown as T, status: response.status, retryCount: attempt };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error('Request timed out');
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error('Unknown error');
      }

      // Check if we should retry
      if (allowRetry && attempt < maxRetries && isRetryableError(lastError, lastStatus)) {
        continue;
      }

      (lastError as Error & { retryCount?: number }).retryCount = attempt;

      // Don't double-count circuit breaker for already-handled errors
      if (!skipCircuitBreaker && !(error instanceof CircuitBreakerError)) {
        if (shouldCountCircuitBreakerFailure(lastStatus)) {
          apiCircuitBreaker.onError();
        }
      }
      throw lastError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error('Request failed after max retries');
}

// Helper for API requests — deduplicates concurrent identical GET requests and records metrics
async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const start = performance.now();
  let status: number | null = null;
  let retryCount = 0;
  let fromCache = false;

  try {
    let result: ApiResult<T>;

    // Only deduplicate safe, idempotent reads
    if (RETRY_SAFE_METHODS.has(method)) {
      const key = createRequestKey(method, path);
      if (apiDeduplicator.has(key)) fromCache = true;
      result = await apiDeduplicator.dedupe(key, () => apiRequestInternal<T>(path, options));
    } else {
      result = await apiRequestInternal<T>(path, options);
    }

    status = result.status;
    retryCount = result.retryCount;
    return result.data;
  } catch (error) {
    const errorStatus = getErrorStatus(error);
    if (typeof errorStatus === 'number') {
      status = errorStatus;
    }

    const errorRetryCount = getErrorRetryCount(error);
    if (typeof errorRetryCount === 'number') {
      retryCount = errorRetryCount;
    }
    throw error;
  } finally {
    recordApiCall({
      path,
      method,
      status,
      durationMs: Math.round(performance.now() - start),
      retryCount,
      fromCache,
      timestamp: Date.now(),
    });
  }
}

// Export circuit breaker status for UI components
export function getApiHealth() {
  return apiCircuitBreaker.getStatus();
}

// Export circuit breaker for direct access
export { apiCircuitBreaker };

// Re-export metrics for UI components
export { getMetricsSummary } from './metrics';

// ============================================
// Agent Sessions API
// ============================================

export const agentApi = {
  // List sessions for current tenant/brand
  listSessions: async (tenantId: string, brandId?: string): Promise<AgentSession[]> => {
    const fallbackBrandId = getResolvedBrandId(brandId, true);
    const sessionPaths = getTenantAgentSessionPaths(tenantId, fallbackBrandId);
    return fetchWithFallbackPaths(sessionPaths, parseSessionsResponsePayload);
  },

  // Get a single session
  getSession: async (
    tenantId: string,
    brandId: string,
    sessionId: string
  ): Promise<AgentSession> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId)
    );
    const response = validateResponse(SessionResponseSchema, raw);
    return response.session;
  },

  // Create a new session
  createSession: async (
    tenantId: string,
    brandId: string,
    agentType: string,
    config?: Partial<AgentSessionConfig>
  ): Promise<AgentSession> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const storedSandboxApiKey = useAuthStore.getState().sandboxApiKey;
    const enrichedConfig =
      storedSandboxApiKey || config
        ? {
            ...(config ?? {}),
            sandbox_api_key: config?.sandbox_api_key || storedSandboxApiKey || undefined,
          }
        : undefined;

    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents'),
      {
        method: 'POST',
        body: JSON.stringify({ agent_type: agentType, config: enrichedConfig }),
      }
    );
    const response = validateResponse(SessionResponseSchema, raw);
    return response.session;
  },

  // Start a session
  startSession: async (
    tenantId: string,
    brandId: string,
    sessionId: string
  ): Promise<AgentSession> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'start'),
      { method: 'POST' }
    );
    const response = validateResponse(SessionResponseSchema, raw);
    return response.session;
  },

  // Pause a session
  pauseSession: async (tenantId: string, brandId: string, sessionId: string): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'pause'),
      {
        method: 'POST',
      }
    );
  },

  // Resume a session
  resumeSession: async (tenantId: string, brandId: string, sessionId: string): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'resume'),
      {
        method: 'POST',
      }
    );
  },

  // Stop a session
  stopSession: async (tenantId: string, brandId: string, sessionId: string): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'stop'),
      {
        method: 'POST',
      }
    );
  },

  // Delete a session
  deleteSession: async (tenantId: string, brandId: string, sessionId: string): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId),
      {
        method: 'DELETE',
      }
    );
  },

  // Send a message to the agent
  sendMessage: async (
    tenantId: string,
    brandId: string,
    sessionId: string,
    message: string
  ): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'message'),
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    );
  },

  // Update session config
  updateConfig: async (
    tenantId: string,
    brandId: string,
    sessionId: string,
    config: AgentSessionConfig
  ): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'agents', sessionId, 'config'),
      {
        method: 'PUT',
        body: JSON.stringify({ config }),
      }
    );
  },

  // Get SSE stream URL (auth is provided via query params by the desktop client).
  getStreamUrl: (tenantId: string, brandId: string, sessionId: string): string => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    return `${API_URL}${buildPath(
      'tenants',
      tenantId,
      'brands',
      resolvedBrandId,
      'agents',
      sessionId,
      'stream'
    )}`;
  },

  // Request a short-lived stream token (preferred over API key in URL)
  getStreamToken: async (
    tenantId: string,
    brandId: string,
    sessionId: string
  ): Promise<string | null> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    try {
      const raw = await apiRequest<unknown>(
        buildPath(
          'tenants',
          tenantId,
          'brands',
          resolvedBrandId,
          'agents',
          sessionId,
          'stream',
          'token'
        ),
        { method: 'POST' }
      );
      const response = validateResponse(StreamTokenResponseSchema, raw);
      return response.token ?? null;
    } catch (error) {
      console.warn('[API] Failed to get stream token:', error);
      return null;
    }
  },
};

// ============================================
// Brands API
// ============================================

export const brandsApi = {
  list: async (tenantId: string): Promise<Brand[]> => {
    const raw = await apiRequest<unknown>(buildPath('tenants', tenantId, 'brands'));
    const unwrapped = unwrapDataEnvelope(raw, 'brands');
    const response = validateResponse(BrandsListResponseSchema, unwrapped);
    return response.brands;
  },

  get: async (tenantId: string, brandId: string): Promise<Brand> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId)
    );
    const unwrapped = unwrapDataEnvelope(raw, 'brand');
    const response = validateResponse(BrandResponseSchema, unwrapped);
    return response.brand;
  },

  create: async (tenantId: string, data: Partial<Brand>): Promise<Brand> => {
    const raw = await apiRequest<unknown>(buildPath('tenants', tenantId, 'brands'), {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const unwrapped = unwrapDataEnvelope(raw, 'brand');
    const response = validateResponse(BrandResponseSchema, unwrapped);
    return response.brand;
  },
};

// ============================================
// Secrets/Connections API
// ============================================

export const secretsApi = {
  // List connected platforms
  listConnections: async (tenantId: string, brandId: string): Promise<PlatformConnection[]> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const resourcePaths = getBrandResourcePaths(tenantId, resolvedBrandId, 'secrets');
    const response = await fetchWithFallbackPaths(resourcePaths, (raw) => {
      const unwrapped = unwrapDataEnvelope(raw, 'platforms');
      return validateResponse(SecretsListResponseSchema, unwrapped);
    });

    // Convert to PlatformConnection format
    return response.platforms.map((platform) => ({
      platform,
      connected: true,
      fields: [],
    }));
  },

  // Store credentials
  storeCredentials: async (
    tenantId: string,
    brandId: string,
    platform: string,
    credentials: Record<string, string>
  ): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'secrets'), {
      method: 'POST',
      body: JSON.stringify({ platform, credentials }),
    });
  },

  // Test connection
  testConnection: async (
    tenantId: string,
    brandId: string,
    platform: string
  ): Promise<{ success: boolean; message: string }> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'secrets', platform, 'test'),
      { method: 'POST' }
    );
    const unwrapped = unwrapDataEnvelope(raw, null);
    const response = validateResponse(SecretsTestResponseSchema, unwrapped);
    return { success: response.success, message: response.message };
  },

  // Delete credentials
  deleteCredentials: async (tenantId: string, brandId: string, platform: string): Promise<void> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    await apiRequest(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'secrets', platform),
      {
        method: 'DELETE',
      }
    );
  },
};

// ============================================
// Webhook mapping helpers (engine ↔ desktop)
// ============================================

type EngineWebhook = z.infer<typeof EngineWebhookSchema>;
type EngineWebhookDeliveryType = z.infer<typeof EngineWebhookDeliverySchema>;

function mapEngineWebhook(
  engine: EngineWebhook,
  fallbackTenantId: string,
  fallbackBrandId: string,
  fallbackName: string = ''
): Webhook {
  return {
    id: engine.id,
    tenant_id: engine.tenant_id ?? fallbackTenantId,
    brand_id: engine.brand_id ?? fallbackBrandId,
    name: engine.description ?? fallbackName,
    url: engine.url,
    direction: 'outgoing',
    events: engine.events,
    status: engine.enabled ? 'active' : 'paused',
    secret: engine.secret,
    created_at: engine.created_at,
    updated_at: engine.updated_at ?? engine.created_at,
    last_triggered_at: engine.last_triggered_at ?? undefined,
  };
}

function mapEngineDelivery(engine: EngineWebhookDeliveryType): WebhookDelivery {
  return {
    id: engine.id,
    webhook_id: engine.webhook_id,
    event: engine.event,
    status_code: engine.response_status,
    request_body: engine.payload,
    response_body: engine.response_body ?? undefined,
    duration_ms: engine.duration_ms,
    success: engine.success,
    created_at: engine.created_at,
  };
}

function mapWebhookCreatePayload(data: {
  name: string;
  url: string;
  events: string[];
  direction?: string;
  headers?: Record<string, string>;
}): Record<string, unknown> {
  return {
    url: data.url,
    description: data.name,
    events: data.events,
    enabled: true,
  };
}

function mapWebhookUpdatePayload(
  data: Partial<{
    name: string;
    url: string;
    events: string[];
    status: string;
    headers: Record<string, string>;
  }>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.url !== undefined) payload.url = data.url;
  if (data.name !== undefined) payload.description = data.name;
  if (data.events !== undefined) payload.events = data.events;
  if (data.status !== undefined) payload.enabled = data.status === 'active';
  return payload;
}

// ============================================
// Webhooks API
// ============================================

export const webhooksApi = {
  // List — tenant-scoped (not brand-scoped)
  list: async (tenantId: string, _brandId: string): Promise<Webhook[]> => {
    const resolvedBrandId = getRequiredBrandId(_brandId);
    const raw = await apiRequest<unknown>(buildPath('tenants', tenantId, 'webhooks'));
    const unwrapped = unwrapDataEnvelope(raw, 'webhooks');
    const response = validateResponse(WebhooksListResponseSchema, unwrapped);
    return response.webhooks.map((w) => mapEngineWebhook(w, tenantId, resolvedBrandId));
  },

  // Get — tenant-scoped
  get: async (tenantId: string, _brandId: string, webhookId: string): Promise<Webhook> => {
    const resolvedBrandId = getRequiredBrandId(_brandId);
    const raw = await apiRequest<unknown>(buildPath('tenants', tenantId, 'webhooks', webhookId));
    const unwrapped = unwrapDataEnvelope(raw, 'webhook');
    const response = validateResponse(WebhookResponseSchema, unwrapped);
    return mapEngineWebhook(response.webhook, tenantId, resolvedBrandId);
  },

  // Create — brand-scoped (kept as-is)
  create: async (
    tenantId: string,
    brandId: string,
    data: {
      name: string;
      url: string;
      events: string[];
      direction?: string;
      headers?: Record<string, string>;
    }
  ): Promise<Webhook> => {
    const resolvedBrandId = getRequiredBrandId(brandId);
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'brands', resolvedBrandId, 'webhooks'),
      { method: 'POST', body: JSON.stringify(mapWebhookCreatePayload(data)) }
    );
    const unwrapped = unwrapDataEnvelope(raw, 'webhook');
    const response = validateResponse(WebhookResponseSchema, unwrapped);
    return mapEngineWebhook(response.webhook, tenantId, resolvedBrandId, data.name);
  },

  // Update — tenant-scoped
  update: async (
    tenantId: string,
    _brandId: string,
    webhookId: string,
    data: Partial<{
      name: string;
      url: string;
      events: string[];
      status: string;
      headers: Record<string, string>;
    }>
  ): Promise<Webhook> => {
    const resolvedBrandId = getRequiredBrandId(_brandId);
    const raw = await apiRequest<unknown>(buildPath('tenants', tenantId, 'webhooks', webhookId), {
      method: 'PUT',
      body: JSON.stringify(mapWebhookUpdatePayload(data)),
    });
    const unwrapped = unwrapDataEnvelope(raw, 'webhook');
    const response = validateResponse(WebhookResponseSchema, unwrapped);
    return mapEngineWebhook(response.webhook, tenantId, resolvedBrandId);
  },

  // Delete — tenant-scoped
  delete: async (tenantId: string, _brandId: string, webhookId: string): Promise<void> => {
    await apiRequest(buildPath('tenants', tenantId, 'webhooks', webhookId), {
      method: 'DELETE',
    });
  },

  // Test — tenant-scoped
  test: async (
    tenantId: string,
    _brandId: string,
    webhookId: string
  ): Promise<{ success: boolean; status_code: number | null; duration_ms: number }> => {
    getRequiredBrandId(_brandId); // validate brand selection
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'webhooks', webhookId, 'test'),
      {
        method: 'POST',
      }
    );
    const unwrapped = unwrapDataEnvelope(raw, null);
    return validateResponse(WebhookTestResponseSchema, unwrapped);
  },

  // Deliveries — tenant-scoped
  listDeliveries: async (
    tenantId: string,
    _brandId: string,
    webhookId: string
  ): Promise<WebhookDelivery[]> => {
    getRequiredBrandId(_brandId); // validate brand selection
    const raw = await apiRequest<unknown>(
      buildPath('tenants', tenantId, 'webhooks', webhookId, 'deliveries')
    );
    const unwrapped = unwrapDataEnvelope(raw, 'deliveries');
    const response = validateResponse(WebhookDeliveriesResponseSchema, unwrapped);
    return response.deliveries.map(mapEngineDelivery);
  },
};
