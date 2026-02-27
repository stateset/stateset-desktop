/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerUser,
  loginWithEmail,
  requestPasswordReset,
  isValidEmail,
  validatePassword,
} from './registration';

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('registration API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerUser posts payload and returns parsed response', async () => {
    const response = {
      ok: true,
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      tenant: { id: 't1', name: 'Tenant', slug: 'tenant', tier: 'pro' },
      brands: [{ id: 'b1', name: 'Brand', slug: 'brand', tenant_id: 't1', enabled: true }],
      credentials: { engine_api_key: 'engine-key', sandbox_api_key: 'sandbox-key' },
    };
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

    const result = await registerUser({
      email: 'a@b.com',
      password: 'Password1',
      name: 'Alice',
      company: 'Acme',
    });

    expect(result).toEqual(response);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/register'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('registerUser returns dedicated message for 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));

    await expect(
      registerUser({
        email: 'a@b.com',
        password: 'Password1',
        name: 'Alice',
      })
    ).rejects.toThrow('Registration is not yet available');
  });

  it('registerUser parses server error details', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        mockJsonResponse({ details: 'Dependency unavailable', code: 'E_UPSTREAM' }, { status: 500 })
      );

    await expect(
      registerUser({
        email: 'a@b.com',
        password: 'Password1',
        name: 'Alice',
      })
    ).rejects.toThrow('Dependency unavailable');
  });

  it('loginWithEmail handles non-OK response', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ message: 'Bad credentials' }, { status: 401 }));
    await expect(loginWithEmail({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'Bad credentials'
    );
  });

  it('loginWithEmail returns dedicated message for 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(loginWithEmail({ email: 'a@b.com', password: 'x' })).rejects.toThrow(
      'Email login is not yet available'
    );
  });

  it('requestPasswordReset succeeds on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    await expect(requestPasswordReset('a@b.com')).resolves.toBeUndefined();
  });

  it('requestPasswordReset propagates parsed error', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ error: 'No account found' }, { status: 400 }));
    await expect(requestPasswordReset('a@b.com')).rejects.toThrow('No account found');
  });

  it('requestPasswordReset returns dedicated message for 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(requestPasswordReset('a@b.com')).rejects.toThrow(
      'Password reset is not yet available'
    );
  });

  it('returns network error message on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      loginWithEmail({
        email: 'a@b.com',
        password: 'Password1',
      })
    ).rejects.toThrow('Unable to connect to server');
  });

  it('returns timeout-specific messages for abort errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(
      registerUser({
        email: 'a@b.com',
        password: 'Password1',
        name: 'Alice',
      })
    ).rejects.toThrow('Registration request timed out');

    await expect(loginWithEmail({ email: 'a@b.com', password: 'Password1' })).rejects.toThrow(
      'Login request timed out'
    );

    await expect(requestPasswordReset('a@b.com')).rejects.toThrow('Request timed out');
  });
});

describe('registration validators', () => {
  it('validates email format', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
  });

  it('validates password strength with detailed errors', () => {
    const weak = validatePassword('abc');
    expect(weak.valid).toBe(false);
    expect(weak.errors).toEqual(
      expect.arrayContaining([
        'Password must be at least 8 characters',
        'Password must contain an uppercase letter',
        'Password must contain a number',
      ])
    );

    const strong = validatePassword('StrongPass1');
    expect(strong.valid).toBe(true);
    expect(strong.errors).toEqual([]);
  });
});
