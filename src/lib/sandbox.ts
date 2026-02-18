/**
 * Sandbox API Client
 *
 * Manages sandbox pod lifecycle via the Sandbox API (api.sandbox.stateset.app)
 */

import { useAuthStore } from '../stores/auth';

const SANDBOX_API_URL = import.meta.env.VITE_SANDBOX_API_URL || 'https://api.sandbox.stateset.app';
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const RETRY_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type SandboxRequestOptions = RequestInit & {
  timeoutMs?: number;
  maxRetries?: number;
  skipRetry?: boolean;
  retryOn?: 'safe' | 'all';
};

// ============================================
// Types
// ============================================

export interface SandboxStartupMetrics {
  total_ms: number;
  pod_creation_ms: number;
  pod_ready_ms: number;
  phases: Array<{
    name: string;
    durationMs: number;
  }>;
}

export interface Sandbox {
  sandbox_id: string;
  org_id: string;
  session_id: string;
  status: 'pending' | 'running' | 'stopped' | 'failed';
  pod_ip: string;
  created_at: string;
  expires_at: string;
  startup_metrics?: SandboxStartupMetrics;
}

export interface SandboxHealth {
  status: string;
  database: string;
  timestamp?: string;
}

// ============================================
// Helper Functions
// ============================================

function getSandboxHeaders(): HeadersInit {
  const sandboxApiKey = useAuthStore.getState().sandboxApiKey;
  return {
    'Content-Type': 'application/json',
    ...(sandboxApiKey ? { Authorization: `ApiKey ${sandboxApiKey}` } : {}),
  };
}

function isRetryableError(error: unknown, status?: number): boolean {
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
}

async function sandboxRequest<T>(path: string, options: SandboxRequestOptions = {}): Promise<T> {
  const {
    timeoutMs = 15000,
    maxRetries = 2,
    skipRetry = false,
    retryOn = 'safe',
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const allowRetry = !skipRetry && (retryOn === 'all' || RETRY_SAFE_METHODS.has(method));

  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = fetchOptions.signal ? null : new AbortController();
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(`${SANDBOX_API_URL}${path}`, {
        ...fetchOptions,
        signal: fetchOptions.signal ?? controller?.signal,
        headers: {
          ...getSandboxHeaders(),
          ...fetchOptions.headers,
        },
      });

      lastStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed.error || parsed.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        const error = new Error(errorMessage);
        lastError = error;

        if (allowRetry && attempt < maxRetries && isRetryableError(error, response.status)) {
          continue;
        }

        throw error;
      }

      const text = await response.text();
      if (!text) return undefined as T;

      return JSON.parse(text) as T;
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

      if (allowRetry && attempt < maxRetries && isRetryableError(lastError, lastStatus)) {
        continue;
      }

      throw lastError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  throw lastError || new Error('Request failed after max retries');
}

// ============================================
// Sandbox API
// ============================================

export const sandboxApi = {
  /**
   * Check Sandbox API health
   */
  health: async (): Promise<SandboxHealth> => {
    return sandboxRequest<SandboxHealth>('/health');
  },

  /**
   * Create a new sandbox pod
   */
  create: async (): Promise<Sandbox> => {
    return sandboxRequest<Sandbox>('/api/sandbox/create', {
      method: 'POST',
    });
  },

  /**
   * Get sandbox status by ID
   */
  get: async (sandboxId: string): Promise<Sandbox> => {
    return sandboxRequest<Sandbox>(`/api/sandbox/${sandboxId}`);
  },

  /**
   * Get sandbox status
   */
  status: async (sandboxId: string): Promise<{ status: string }> => {
    return sandboxRequest<{ status: string }>(`/api/sandbox/${sandboxId}/status`);
  },

  /**
   * Terminate a sandbox pod
   */
  terminate: async (sandboxId: string): Promise<void> => {
    await sandboxRequest(`/api/sandbox/${sandboxId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Stop and delete a sandbox
   */
  stop: async (sandboxId: string): Promise<void> => {
    await sandboxRequest(`/api/sandbox/${sandboxId}/stop`, {
      method: 'POST',
    });
  },

  /**
   * Execute a command in a sandbox
   */
  execute: async (
    sandboxId: string,
    command: string
  ): Promise<{ output: string; exitCode: number }> => {
    return sandboxRequest(`/api/sandbox/${sandboxId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  },

  /**
   * Write a file in the sandbox
   */
  writeFile: async (sandboxId: string, path: string, content: string): Promise<void> => {
    await sandboxRequest(`/api/sandbox/${sandboxId}/files`, {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  },

  /**
   * Read a file from the sandbox
   */
  readFile: async (sandboxId: string, path: string): Promise<{ content: string }> => {
    return sandboxRequest<{ content: string }>(
      `/api/sandbox/${sandboxId}/files?path=${encodeURIComponent(path)}`
    );
  },
};

// ============================================
// React Query Keys
// ============================================

export const sandboxQueryKeys = {
  all: ['sandbox'] as const,
  health: () => [...sandboxQueryKeys.all, 'health'] as const,
  list: () => [...sandboxQueryKeys.all, 'list'] as const,
  detail: (id: string) => [...sandboxQueryKeys.all, 'detail', id] as const,
};
