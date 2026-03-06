import { create } from 'zustand';
import type { Tenant, Brand } from '../types';
import { API_CONFIG } from '../config/api.config';
import { useAuditLogStore } from './auditLog';
import { isElectronAvailable } from '../lib/electron';

const INVALID_SANDBOX_API_KEY_VALUES = new Set([
  'sandbox_key_pending',
  'placeholder',
  'pending',
  'not_set',
  'none',
  'null',
  'undefined',
]);

const normalize = (value: string): string => value.trim();
const PREFERRED_BRAND_ID_KEY = 'currentBrandId';

function selectCurrentBrand(brands: Brand[], preferredBrand: Brand | null): Brand | null {
  if (!brands.length) {
    return null;
  }

  const enabledBrands = brands.filter((brand) => brand.enabled);
  if (!enabledBrands.length) {
    return null;
  }

  if (!preferredBrand?.id) {
    return enabledBrands[0] || null;
  }

  return enabledBrands.find((brand) => brand.id === preferredBrand.id) ?? enabledBrands[0] ?? null;
}

function resolvePreferredBrand(
  brands: Brand[],
  preferredBrandId: string | null,
  preferredBrand: Brand | null
): Brand | null {
  const preferredFromId = preferredBrandId
    ? (brands.find((brand) => brand.id === preferredBrandId) ?? null)
    : null;

  return selectCurrentBrand(brands, preferredFromId ?? preferredBrand);
}

async function getStoredPreferredBrandId(): Promise<string | null> {
  if (!isElectronAvailable() || !window.electronAPI?.store?.get) {
    return null;
  }

  try {
    const rawValue = await window.electronAPI.store.get(PREFERRED_BRAND_ID_KEY);
    if (typeof rawValue !== 'string') {
      return null;
    }

    const normalizedValue = rawValue.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  } catch (error) {
    console.warn('Failed to read preferred brand ID:', error);
    return null;
  }
}

async function persistPreferredBrandId(brandId: string | null): Promise<void> {
  if (!isElectronAvailable() || !window.electronAPI?.store) {
    return;
  }

  try {
    if (brandId) {
      await window.electronAPI.store.set(PREFERRED_BRAND_ID_KEY, brandId);
      return;
    }

    await window.electronAPI.store.delete(PREFERRED_BRAND_ID_KEY);
  } catch (error) {
    console.warn('Failed to persist preferred brand ID:', error);
  }
}

function buildCachedAuthError(code: 'NETWORK_ERROR' | 'SERVER_ERROR'): AuthError {
  return {
    code,
    message: 'Could not verify credentials',
    details: 'Running in cached mode with stored credentials.',
  };
}

export function normalizeSandboxApiKey(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = normalize(raw);
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (INVALID_SANDBOX_API_KEY_VALUES.has(lowered)) {
    return null;
  }

  return trimmed;
}

/**
 * Authentication error types for better error handling
 */
export type AuthErrorCode =
  | 'INVALID_API_KEY'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'STORAGE_ERROR'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: string;
}

type LoginFallback = {
  tenant?: { id: string; name: string; slug: string; tier: string } | null;
  brands?: Array<{ id: string; name: string; slug: string; tenant_id: string; enabled: boolean }>;
};

/**
 * Parse API error response to AuthError
 */
function parseAuthError(response: Response, fallbackMessage: string): AuthError {
  if (response.status === 401 || response.status === 403) {
    return {
      code: 'INVALID_API_KEY',
      message: 'Invalid or expired API key',
      details: 'Please check your API key and try again.',
    };
  }
  if (response.status >= 500) {
    return {
      code: 'SERVER_ERROR',
      message: 'Server error',
      details: 'The server is experiencing issues. Please try again later.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: fallbackMessage,
    details: `Status: ${response.status}`,
  };
}

/**
 * Parse network/fetch error to AuthError
 */
function parseNetworkError(error: unknown): AuthError {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to server',
      details: 'Please check your internet connection and try again.',
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: error.message,
      details: error.stack,
    };
  }
  return {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred',
    details: String(error),
  };
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  apiKey: string | null;
  sandboxApiKey: string | null;
  tenant: Tenant | null;
  currentBrand: Brand | null;
  brands: Brand[];
  error: AuthError | null;
  initAttempts: number;

  // Actions
  initialize: () => Promise<void>;
  login: (apiKey: string, fallback?: LoginFallback) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentBrand: (brand: Brand) => void;
  setBrands: (brands: Brand[]) => void;
  clearError: () => void;
  // Sandbox API key actions
  setSandboxApiKey: (apiKey: string) => Promise<void>;
  clearSandboxApiKey: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  apiKey: null,
  sandboxApiKey: null,
  tenant: null,
  currentBrand: null,
  brands: [],
  error: null,
  initAttempts: 0,

  initialize: async () => {
    // Guard against concurrent initialization (e.g., React StrictMode double-mount)
    if (get().isLoading && get().initAttempts > 0) return;
    const { initAttempts } = get();
    set({ isLoading: true, initAttempts: initAttempts + 1, error: null });

    try {
      // Check for stored API key (only in Electron)
      if (!window.electronAPI) {
        set({ isLoading: false });
        return;
      }

      let storedKey: string | undefined;
      let storedSandboxKey: string | undefined;

      try {
        storedKey = await window.electronAPI.auth.getApiKey();
        storedSandboxKey = await window.electronAPI.auth.getSandboxApiKey();
      } catch (storageError) {
        console.error('Failed to read credentials from storage:', storageError);
        set({
          isLoading: false,
          error: {
            code: 'STORAGE_ERROR',
            message: 'Failed to read stored credentials',
            details: storageError instanceof Error ? storageError.message : 'Unknown error',
          },
        });
        return;
      }

      const e2eAuth = typeof window !== 'undefined' ? window.__E2E_AUTH__ : null;
      const isE2ETest = window.electronAPI?.app?.isE2ETest === true;
      const effectiveSandboxKey = normalizeSandboxApiKey(storedSandboxKey);
      const preferredBrandId = await getStoredPreferredBrandId();
      if (
        storedSandboxKey &&
        !effectiveSandboxKey &&
        window.electronAPI?.auth?.clearSandboxApiKey
      ) {
        await window.electronAPI.auth.clearSandboxApiKey();
      }

      if (isE2ETest && e2eAuth?.tenant && Array.isArray(e2eAuth.brands)) {
        const selectedBrand = resolvePreferredBrand(e2eAuth.brands, preferredBrandId, null);
        set({
          isAuthenticated: true,
          apiKey: storedKey || 'e2e-test-key',
          sandboxApiKey: effectiveSandboxKey || null,
          tenant: e2eAuth.tenant,
          brands: e2eAuth.brands,
          currentBrand: selectedBrand,
          isLoading: false,
        });
        await persistPreferredBrandId(selectedBrand?.id ?? null);
        return;
      }

      if (storedKey) {
        // Validate the key by fetching tenant info with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(`${getApiUrl()}/api/v1/auth/me`, {
            headers: {
              Authorization: `ApiKey ${storedKey}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const responseBrands = Array.isArray(data.brands) ? data.brands : [];
            const selectedBrand = resolvePreferredBrand(
              responseBrands,
              preferredBrandId,
              get().currentBrand
            );
            set({
              isAuthenticated: true,
              apiKey: storedKey,
              sandboxApiKey: effectiveSandboxKey,
              tenant: data.tenant,
              brands: responseBrands,
              currentBrand: selectedBrand,
              isLoading: false,
            });
            await persistPreferredBrandId(selectedBrand?.id ?? null);
            return;
          }

          // Stored key is invalid, clear it
          if (response.status === 401 || response.status === 403) {
            console.warn('Stored API key is invalid, clearing...');
            await window.electronAPI.auth.clearApiKey();
            set({
              isLoading: false,
              sandboxApiKey: effectiveSandboxKey,
              error: {
                code: 'SESSION_EXPIRED',
                message: 'Your session has expired',
                details: 'Please log in again.',
              },
            });
            return;
          }

          if (response.status >= 500 || response.status === 429) {
            console.warn(`Auth validation returned ${response.status}, using cached credentials.`);
            set({
              isAuthenticated: true,
              apiKey: storedKey,
              sandboxApiKey: effectiveSandboxKey,
              isLoading: false,
              error: buildCachedAuthError('SERVER_ERROR'),
            });
            return;
          }

          set({
            isLoading: false,
            sandboxApiKey: effectiveSandboxKey,
            error: parseAuthError(response, 'Could not verify stored credentials'),
          });
          return;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          // On network error during init, don't clear the key - user might be offline
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.warn('Auth validation timed out');
          } else {
            console.warn('Failed to validate stored key:', fetchError);
          }
          // Allow app to continue with stored key in offline mode
          set({
            isAuthenticated: true,
            apiKey: storedKey,
            sandboxApiKey: effectiveSandboxKey,
            isLoading: false,
            error: buildCachedAuthError('NETWORK_ERROR'),
          });
          return;
        }
      }

      // Even if not authenticated, load sandbox key if present
      set({ isLoading: false, sandboxApiKey: effectiveSandboxKey });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({
        isLoading: false,
        error: parseNetworkError(error),
      });
    }
  },

  login: async (apiKey: string, fallback?: LoginFallback) => {
    set({ isLoading: true, error: null });

    try {
      // Validate API key format
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        const error: AuthError = {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key format',
          details: 'API key must be at least 10 characters.',
        };
        set({ isLoading: false, error });
        throw new Error(error.message);
      }

      // E2E hook to avoid real network auth when tests provide mock auth data.
      const e2eAuth = typeof window !== 'undefined' ? window.__E2E_AUTH__ : null;
      const isE2ETest = window.electronAPI?.app?.isE2ETest === true;
      const preferredBrandId = await getStoredPreferredBrandId();
      if (isE2ETest && e2eAuth?.tenant && Array.isArray(e2eAuth.brands)) {
        if (window.electronAPI) {
          await window.electronAPI.auth.setApiKey(apiKey);
        }
        const selectedBrand = resolvePreferredBrand(e2eAuth.brands, preferredBrandId, null);
        set({
          isAuthenticated: true,
          apiKey,
          tenant: e2eAuth.tenant,
          brands: e2eAuth.brands,
          currentBrand: selectedBrand,
          isLoading: false,
        });
        await persistPreferredBrandId(selectedBrand?.id ?? null);
        return;
      }

      // Validate the API key with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(`${getApiUrl()}/api/v1/auth/me`, {
          headers: {
            Authorization: `ApiKey ${apiKey}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const error = parseNetworkError(fetchError);
        set({ isLoading: false, error });
        throw new Error(error.message);
      }

      if (!response.ok) {
        if (response.status >= 500 && fallback) {
          const fallbackBrands = Array.isArray(fallback.brands) ? fallback.brands : [];
          try {
            if (window.electronAPI) {
              await window.electronAPI.auth.setApiKey(apiKey);
            }
          } catch (storageError) {
            console.error('Failed to store API key:', storageError);
          }

          const selectedBrand = resolvePreferredBrand(
            fallbackBrands as Brand[],
            preferredBrandId,
            get().currentBrand
          );
          set({
            isAuthenticated: true,
            apiKey,
            sandboxApiKey: get().sandboxApiKey,
            tenant: (fallback.tenant as Tenant | undefined) ?? null,
            brands: fallbackBrands as Brand[],
            currentBrand: selectedBrand,
            isLoading: false,
          });
          await persistPreferredBrandId(selectedBrand?.id ?? null);

          useAuditLogStore
            .getState()
            .log('user.login', `Logged in as ${fallback.tenant?.name || 'unknown'}`);

          return;
        }

        const error = parseAuthError(response, 'Login failed');
        set({ isLoading: false, error });
        throw new Error(error.message);
      }

      const data = await response.json();

      // Store the API key (only in Electron)
      if (window.electronAPI) {
        try {
          await window.electronAPI.auth.setApiKey(apiKey);
        } catch (storageError) {
          console.error('Failed to store API key:', storageError);
          // Continue anyway - the key will work for this session
        }
      }

      const loginBrands = Array.isArray(data.brands) ? data.brands : [];
      const selectedBrand = resolvePreferredBrand(
        loginBrands,
        preferredBrandId,
        get().currentBrand
      );
      set({
        isAuthenticated: true,
        apiKey,
        tenant: data.tenant,
        brands: loginBrands,
        currentBrand: selectedBrand,
        isLoading: false,
      });
      await persistPreferredBrandId(selectedBrand?.id ?? null);

      useAuditLogStore
        .getState()
        .log('user.login', `Logged in as ${data.tenant?.name || 'unknown'}`);
    } catch (error) {
      // Error already set in the try block for specific cases
      if (get().error === null) {
        set({ isLoading: false, error: parseNetworkError(error) });
      }
      throw error;
    }
  },

  logout: async () => {
    useAuditLogStore.getState().log('user.logout', 'User logged out');
    if (window.electronAPI) {
      await Promise.allSettled([
        window.electronAPI.auth.clearApiKey?.() ?? Promise.resolve(false),
        window.electronAPI.auth.clearSandboxApiKey?.() ?? Promise.resolve(false),
        window.electronAPI.store.delete?.(PREFERRED_BRAND_ID_KEY) ?? Promise.resolve(false),
      ]);
    }
    set({
      isAuthenticated: false,
      apiKey: null,
      sandboxApiKey: null,
      tenant: null,
      currentBrand: null,
      brands: [],
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },

  setCurrentBrand: (brand: Brand) => {
    const selectableBrand = get().brands.find((candidate) => candidate.id === brand.id);
    if (!selectableBrand?.enabled) {
      return;
    }
    set({ currentBrand: selectableBrand });
    void persistPreferredBrandId(selectableBrand.id);
  },

  setBrands: (brands: Brand[]) => {
    const selectedBrand = resolvePreferredBrand(brands, null, get().currentBrand);
    set({
      brands,
      currentBrand: selectedBrand,
    });
    void persistPreferredBrandId(selectedBrand?.id ?? null);
  },

  setSandboxApiKey: async (apiKey: string) => {
    const normalizedApiKey = normalizeSandboxApiKey(apiKey);

    if (!normalizedApiKey) {
      if (window.electronAPI) {
        await window.electronAPI.auth.clearSandboxApiKey();
      }
      set({ sandboxApiKey: null });
      return;
    }

    if (window.electronAPI) {
      await window.electronAPI.auth.setSandboxApiKey(normalizedApiKey);
    }
    set({ sandboxApiKey: normalizedApiKey });
  },

  clearSandboxApiKey: async () => {
    if (window.electronAPI) {
      await window.electronAPI.auth.clearSandboxApiKey();
    }
    set({ sandboxApiKey: null });
  },
}));

// Helper to get API URL
function getApiUrl(): string {
  return API_CONFIG.baseUrl;
}
