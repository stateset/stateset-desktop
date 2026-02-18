import { create } from 'zustand';
import type { Tenant, Brand } from '../types';
import { API_CONFIG } from '../config/api.config';
import { useAuditLogStore } from './auditLog';

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
  login: (apiKey: string) => Promise<void>;
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

      if (isE2ETest && e2eAuth?.tenant && Array.isArray(e2eAuth.brands)) {
        set({
          isAuthenticated: true,
          apiKey: storedKey || 'e2e-test-key',
          sandboxApiKey: storedSandboxKey || null,
          tenant: e2eAuth.tenant,
          brands: e2eAuth.brands,
          currentBrand: e2eAuth.brands?.[0] || null,
          isLoading: false,
        });
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
            set({
              isAuthenticated: true,
              apiKey: storedKey,
              sandboxApiKey: storedSandboxKey || null,
              tenant: data.tenant,
              brands: data.brands || [],
              currentBrand: data.brands?.[0] || null,
              isLoading: false,
            });
            return;
          }

          // Stored key is invalid, clear it
          if (response.status === 401 || response.status === 403) {
            console.warn('Stored API key is invalid, clearing...');
            await window.electronAPI.auth.clearApiKey();
            set({
              isLoading: false,
              sandboxApiKey: storedSandboxKey || null,
              error: {
                code: 'SESSION_EXPIRED',
                message: 'Your session has expired',
                details: 'Please log in again.',
              },
            });
            return;
          }
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
            sandboxApiKey: storedSandboxKey || null,
            isLoading: false,
            error: {
              code: 'NETWORK_ERROR',
              message: 'Could not verify credentials',
              details: 'Running in offline mode with cached credentials.',
            },
          });
          return;
        }
      }

      // Even if not authenticated, load sandbox key if present
      set({ isLoading: false, sandboxApiKey: storedSandboxKey || null });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({
        isLoading: false,
        error: parseNetworkError(error),
      });
    }
  },

  login: async (apiKey: string) => {
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
      if (isE2ETest && e2eAuth?.tenant && Array.isArray(e2eAuth.brands)) {
        if (window.electronAPI) {
          await window.electronAPI.auth.setApiKey(apiKey);
        }
        set({
          isAuthenticated: true,
          apiKey,
          tenant: e2eAuth.tenant,
          brands: e2eAuth.brands,
          currentBrand: e2eAuth.brands?.[0] || null,
          isLoading: false,
        });
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

      set({
        isAuthenticated: true,
        apiKey,
        tenant: data.tenant,
        brands: data.brands || [],
        currentBrand: data.brands?.[0] || null,
        isLoading: false,
      });

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
      await window.electronAPI.auth.clearApiKey();
      // Note: We don't clear sandbox key on logout - it's a separate credential
    }
    set({
      isAuthenticated: false,
      apiKey: null,
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
    set({ currentBrand: brand });
  },

  setBrands: (brands: Brand[]) => {
    set({ brands });
    if (!get().currentBrand && brands.length > 0) {
      set({ currentBrand: brands[0] });
    }
  },

  setSandboxApiKey: async (apiKey: string) => {
    if (window.electronAPI) {
      await window.electronAPI.auth.setSandboxApiKey(apiKey);
    }
    set({ sandboxApiKey: apiKey });
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
