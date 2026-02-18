/**
 * Registration API Client
 *
 * Handles user registration and automatic API key provisioning
 */

import { API_CONFIG } from '../config/api.config';

const ENGINE_API_URL = API_CONFIG.baseUrl;

type ApiErrorPayload = {
  message?: unknown;
  error?: unknown;
  detail?: unknown;
  details?: unknown;
  code?: string;
};

async function parseAuthError(response: Response, defaultMessage: string): Promise<Error> {
  const status = response.status;

  const responseText = await response.text().catch(() => '');
  let payload: ApiErrorPayload | null = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as ApiErrorPayload;
    } catch {
      payload = null;
    }
  }

  const fallbackMessage =
    typeof responseText === 'string' && responseText.trim() ? responseText.trim() : undefined;

  const bodyMessage =
    typeof payload?.message === 'string'
      ? payload.message
      : typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.error === 'object' && payload.error !== null && 'message' in payload.error
          ? (payload.error as { message?: unknown }).message
          : undefined;
  const bodyMessageText = typeof bodyMessage === 'string' ? bodyMessage : undefined;
  const detailsText =
    typeof payload?.details === 'string'
      ? payload.details
      : typeof payload?.detail === 'string'
        ? payload.detail
        : fallbackMessage;
  const code = payload?.code;

  if (status >= 500) {
    const serverHint = code ? ` (code: ${code})` : '';
    return new Error(
      detailsText
        ? `${defaultMessage}: ${detailsText}${serverHint}`
        : bodyMessageText
          ? `${bodyMessageText}${serverHint}`
          : `${defaultMessage}${serverHint}`
    );
  }

  return new Error(
    typeof bodyMessageText === 'string' && bodyMessageText.trim()
      ? bodyMessageText
      : code
        ? `${defaultMessage} (code: ${code})`
        : defaultMessage
  );
}

// ============================================
// Types
// ============================================

export interface RegistrationRequest {
  email: string;
  password: string;
  name: string;
  company?: string;
}

export interface RegistrationResponse {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    tier: string;
  };
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    tenant_id: string;
    enabled: boolean;
  }>;
  // Auto-provisioned API keys
  credentials: {
    engine_api_key: string;
    sandbox_api_key: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    tier: string;
  };
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    tenant_id: string;
    enabled: boolean;
  }>;
  credentials: {
    engine_api_key: string;
    sandbox_api_key: string;
  };
}

// ============================================
// API Functions
// ============================================

/**
 * Register a new user and auto-provision API keys
 */
export async function registerUser(data: RegistrationRequest): Promise<RegistrationResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  let response: Response;
  try {
    response = await fetch(`${ENGINE_API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        'Registration request timed out. Please check your connection and try again.'
      );
    }
    throw new Error('Unable to connect to server. Please check your internet connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'Registration is not yet available. Please use an API key to sign in, or contact support for access.'
      );
    }
    throw await parseAuthError(response, 'Registration failed');
  }

  return response.json();
}

/**
 * Login with email/password and get API keys
 */
export async function loginWithEmail(data: LoginRequest): Promise<LoginResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  let response: Response;
  try {
    response = await fetch(`${ENGINE_API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Login request timed out. Please check your connection and try again.');
    }
    throw new Error('Unable to connect to server. Please check your internet connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Email login is not yet available. Please use an API key to sign in.');
    }
    throw await parseAuthError(response, 'Invalid email or password');
  }

  return response.json();
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  let response: Response;
  try {
    response = await fetch(`${ENGINE_API_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error('Unable to connect to server. Please check your internet connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw await parseAuthError(response, 'Failed to send reset email');
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }

  return { valid: errors.length === 0, errors };
}
