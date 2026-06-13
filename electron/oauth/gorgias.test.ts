import type * as http from 'http';
import type { BrowserWindow } from 'electron';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindowMock {},
  shell: { openExternal: vi.fn() },
}));

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>();
  return {
    ...actual,
    createOAuthServer: vi.fn(),
    findAvailableOAuthPort: vi.fn(),
    openOAuthWindow: vi.fn(),
  };
});

import { OAuthError, createOAuthServer, findAvailableOAuthPort, openOAuthWindow } from './utils';
import { GorgiasOAuth } from './gorgias';

const createOAuthServerMock = vi.mocked(createOAuthServer);
const findAvailableOAuthPortMock = vi.mocked(findAvailableOAuthPort);
const openOAuthWindowMock = vi.mocked(openOAuthWindow);

type OAuthCallbackHandler = Parameters<typeof createOAuthServer>[1];

const CLIENT_ID = 'gorgias-client-id';
const CLIENT_SECRET = 'gorgias-client-secret';
const BASE_PORT = 8235;
const TIMEOUT_MS = 5 * 60 * 1000;
const EXPECTED_SCOPE =
  'openid account:read tickets:read tickets:write customers:read customers:write';

let capturedHandler: OAuthCallbackHandler | undefined;
let serverOn: ReturnType<typeof vi.fn>;
let cleanup: ReturnType<typeof vi.fn>;
let windowClose: ReturnType<typeof vi.fn>;

function createRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
    writableEnded: false,
  };
  return res as unknown as http.ServerResponse & typeof res;
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function createOAuth() {
  return new GorgiasOAuth({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
}

async function startFlow(domain = 'acme') {
  const promise = createOAuth().startAuth(domain);
  promise.catch(() => undefined);
  await flushMicrotasks();
  expect(openOAuthWindowMock).toHaveBeenCalledTimes(1);
  expect(capturedHandler).toBeDefined();
  const authUrl = new URL(openOAuthWindowMock.mock.calls[0][0]);
  const state = authUrl.searchParams.get('state') ?? '';
  const handler = capturedHandler as OAuthCallbackHandler;
  return { promise, authUrl, state, handler };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandler = undefined;
  serverOn = vi.fn();
  cleanup = vi.fn();
  windowClose = vi.fn();

  findAvailableOAuthPortMock.mockImplementation(async (basePort) => basePort);
  createOAuthServerMock.mockImplementation(async (_config, handler) => {
    capturedHandler = handler;
    return {
      server: { on: serverOn } as unknown as http.Server,
      cleanup: cleanup as unknown as () => void,
    };
  });
  openOAuthWindowMock.mockImplementation(
    () => ({ close: windowClose }) as unknown as BrowserWindow
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GorgiasOAuth.startAuth - preconditions', () => {
  it('rejects with NOT_CONFIGURED when credentials are missing', async () => {
    const oauth = new GorgiasOAuth({ clientId: '', clientSecret: '' });
    await expect(oauth.startAuth('acme')).rejects.toMatchObject({
      name: 'OAuthError',
      code: 'NOT_CONFIGURED',
      provider: 'Gorgias',
    });
    expect(createOAuthServerMock).not.toHaveBeenCalled();
  });

  it('rejects with INVALID_DOMAIN for invalid subdomains', async () => {
    await expect(createOAuth().startAuth('bad_domain!')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
      provider: 'Gorgias',
    });
    await expect(createOAuth().startAuth('')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
    });
  });

  it('rejects with PORT_IN_USE when no callback port is available', async () => {
    findAvailableOAuthPortMock.mockResolvedValue(null);
    await expect(createOAuth().startAuth('acme')).rejects.toMatchObject({
      code: 'PORT_IN_USE',
    });
    expect(findAvailableOAuthPortMock).toHaveBeenCalledWith(BASE_PORT, 6);
  });
});

describe('GorgiasOAuth.startAuth - authorization URL', () => {
  it('builds the authorization URL with client id, scopes, redirect uri, and state', async () => {
    const { authUrl, state } = await startFlow();

    expect(authUrl.origin).toBe('https://app.gorgias.com');
    expect(authUrl.pathname).toBe('/oauth/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authUrl.searchParams.get('response_type')).toBe('code');
    expect(authUrl.searchParams.get('scope')).toBe(EXPECTED_SCOPE);
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`http://localhost:${BASE_PORT}/callback`);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('normalizes full gorgias.com URLs down to the subdomain', async () => {
    await startFlow('https://acme.gorgias.com');
    const config = createOAuthServerMock.mock.calls[0][0];
    expect(config).toMatchObject({
      provider: 'Gorgias',
      redirectPort: BASE_PORT,
      timeoutMs: TIMEOUT_MS,
      callbackPath: '/callback',
    });
  });
});

describe('GorgiasOAuth.startAuth - callback validation', () => {
  it('rejects with USER_CANCELLED when the user denies authorization', async () => {
    const { promise, handler } = await startFlow();
    const res = createRes();

    await handler({ error: 'access_denied' }, res);

    await expect(promise).rejects.toMatchObject({ code: 'USER_CANCELLED' });
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with STATE_MISMATCH when the returned state does not match', async () => {
    const { promise, handler } = await startFlow();
    const res = createRes();

    await handler({ code: 'abc', state: 'tampered-state' }, res);

    await expect(promise).rejects.toMatchObject({ code: 'STATE_MISMATCH' });
    expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'text/html' });
  });

  it('rejects with MISSING_CODE when no authorization code is returned', async () => {
    const { promise, state, handler } = await startFlow();

    await handler({ state }, createRes());

    await expect(promise).rejects.toMatchObject({ code: 'MISSING_CODE' });
  });

  it('rejects oversized authorization codes', async () => {
    const { promise, state, handler } = await startFlow();

    await handler({ code: 'x'.repeat(2049), state }, createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'MISSING_CODE',
      message: 'Authorization code is invalid',
    });
  });
});

describe('GorgiasOAuth.startAuth - token exchange', () => {
  it('resolves credentials on a successful token exchange', async () => {
    const { promise, state, handler } = await startFlow('https://acme.gorgias.com');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'gorgias-token',
        account: { domain: 'acme', email: 'owner@acme.com' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = createRes();

    await handler({ code: 'auth-code', state }, res);

    await expect(promise).resolves.toEqual({
      domain: 'acme',
      api_key: 'gorgias-token',
      email: 'owner@acme.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.gorgias.com/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_id')).toBe(CLIENT_ID);
    expect(body.get('client_secret')).toBe(CLIENT_SECRET);
    expect(body.get('redirect_uri')).toBe(`http://localhost:${BASE_PORT}/callback`);

    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('defaults email to an empty string when the account is missing', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'gorgias-token' }),
      })
    );

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).resolves.toMatchObject({ api_key: 'gorgias-token', email: '' });
  });

  it('rejects with TOKEN_EXCHANGE_FAILED on an HTTP error response', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'bad request',
      })
    );

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Token exchange failed: 400 - bad request',
    });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with TOKEN_EXCHANGE_FAILED and serves an error page on network failure', async () => {
    const { promise, state, handler } = await startFlow();
    const networkError = new Error('ECONNREFUSED');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));
    const res = createRes();

    await handler({ code: 'auth-code', state }, res);

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Authentication failed: ECONNREFUSED',
      cause: networkError,
    });
    expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'text/html' });
  });

  it('rejects with INVALID_RESPONSE when the response has no access token', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ account: { domain: 'acme', email: 'owner@acme.com' } }),
      })
    );

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('GorgiasOAuth.startAuth - lifecycle', () => {
  it('rejects with TIMEOUT and cleans up when the callback never arrives', async () => {
    vi.useFakeTimers();
    const { promise } = await startFlow();

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with USER_CANCELLED when the auth window is closed', async () => {
    const { promise } = await startFlow();

    const onClosed = openOAuthWindowMock.mock.calls[0][2];
    onClosed();
    expect(cleanup).toHaveBeenCalled();

    const closeCall = serverOn.mock.calls.find(([event]) => event === 'close');
    expect(closeCall).toBeDefined();
    (closeCall?.[1] as () => void)();

    await expect(promise).rejects.toMatchObject({ code: 'USER_CANCELLED' });
  });

  it('propagates OAuthError rejections from server creation', async () => {
    createOAuthServerMock.mockRejectedValue(new OAuthError('port busy', 'PORT_IN_USE', 'Gorgias'));

    await expect(createOAuth().startAuth('acme')).rejects.toMatchObject({
      code: 'PORT_IN_USE',
      message: 'port busy',
    });
  });

  it('wraps unknown server creation failures as NETWORK_ERROR', async () => {
    createOAuthServerMock.mockRejectedValue(new Error('listen failed'));

    await expect(createOAuth().startAuth('acme')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Authentication failed: listen failed',
    });
  });
});
