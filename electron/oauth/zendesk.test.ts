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
import { ZendeskOAuth } from './zendesk';

const createOAuthServerMock = vi.mocked(createOAuthServer);
const findAvailableOAuthPortMock = vi.mocked(findAvailableOAuthPort);
const openOAuthWindowMock = vi.mocked(openOAuthWindow);

type OAuthCallbackHandler = Parameters<typeof createOAuthServer>[1];

const CLIENT_ID = 'zendesk-client-id';
const CLIENT_SECRET = 'zendesk-client-secret';
const BASE_PORT = 8236;
const TIMEOUT_MS = 5 * 60 * 1000;

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
  return new ZendeskOAuth({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
}

async function startFlow(subdomain = 'acme') {
  const promise = createOAuth().startAuth(subdomain);
  promise.catch(() => undefined);
  await flushMicrotasks();
  expect(openOAuthWindowMock).toHaveBeenCalledTimes(1);
  expect(capturedHandler).toBeDefined();
  const authUrl = new URL(openOAuthWindowMock.mock.calls[0][0]);
  const state = authUrl.searchParams.get('state') ?? '';
  const handler = capturedHandler as OAuthCallbackHandler;
  return { promise, authUrl, state, handler };
}

function stubTokenAndUserFetch(options?: {
  tokenPayload?: unknown;
  userOk?: boolean;
  userPayload?: unknown;
}) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => options?.tokenPayload ?? { access_token: 'zd-token', token_type: 'bearer' },
    })
    .mockResolvedValueOnce({
      ok: options?.userOk ?? true,
      json: async () => options?.userPayload ?? { user: { email: 'agent@acme.com' } },
    });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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

describe('ZendeskOAuth.startAuth - preconditions', () => {
  it('rejects with NOT_CONFIGURED when credentials are missing', async () => {
    const oauth = new ZendeskOAuth({ clientId: '', clientSecret: '' });
    await expect(oauth.startAuth('acme')).rejects.toMatchObject({
      name: 'OAuthError',
      code: 'NOT_CONFIGURED',
      provider: 'Zendesk',
    });
    expect(createOAuthServerMock).not.toHaveBeenCalled();
  });

  it('rejects with INVALID_DOMAIN for invalid subdomains', async () => {
    await expect(createOAuth().startAuth('not a subdomain')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
      provider: 'Zendesk',
    });
    await expect(createOAuth().startAuth('-acme')).rejects.toMatchObject({
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

describe('ZendeskOAuth.startAuth - authorization URL', () => {
  it('builds the authorization URL with client id, scopes, redirect uri, and state', async () => {
    const { authUrl, state } = await startFlow();

    expect(authUrl.origin).toBe('https://acme.zendesk.com');
    expect(authUrl.pathname).toBe('/oauth/authorizations/new');
    expect(authUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authUrl.searchParams.get('response_type')).toBe('code');
    expect(authUrl.searchParams.get('scope')).toBe(
      'read write tickets:read tickets:write users:read users:write'
    );
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`http://localhost:${BASE_PORT}/callback`);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('normalizes full zendesk.com URLs down to the subdomain', async () => {
    const { authUrl } = await startFlow('https://acme.zendesk.com');
    expect(authUrl.origin).toBe('https://acme.zendesk.com');

    const config = createOAuthServerMock.mock.calls[0][0];
    expect(config).toMatchObject({
      provider: 'Zendesk',
      redirectPort: BASE_PORT,
      timeoutMs: TIMEOUT_MS,
      callbackPath: '/callback',
    });
  });
});

describe('ZendeskOAuth.startAuth - callback validation', () => {
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

describe('ZendeskOAuth.startAuth - token exchange', () => {
  it('resolves credentials including the user email on success', async () => {
    const { promise, state, handler } = await startFlow();
    const fetchMock = stubTokenAndUserFetch();
    const res = createRes();

    await handler({ code: 'auth-code', state }, res);

    await expect(promise).resolves.toEqual({
      subdomain: 'acme',
      api_token: 'zd-token',
      email: 'agent@acme.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://acme.zendesk.com/oauth/tokens');
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(tokenInit.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `http://localhost:${BASE_PORT}/callback`,
      scope: 'read write',
    });

    const [userUrl, userInit] = fetchMock.mock.calls[1];
    expect(userUrl).toBe('https://acme.zendesk.com/api/v2/users/me.json');
    expect(userInit.headers).toEqual({ Authorization: 'Bearer zd-token' });

    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('falls back to an empty email when the user info request fails', async () => {
    const { promise, state, handler } = await startFlow();
    stubTokenAndUserFetch({ userOk: false });

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).resolves.toMatchObject({ api_token: 'zd-token', email: '' });
  });

  it('falls back to an empty email when the user payload has no user', async () => {
    const { promise, state, handler } = await startFlow();
    stubTokenAndUserFetch({ userPayload: {} });

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).resolves.toMatchObject({ email: '' });
  });

  it('rejects with TOKEN_EXCHANGE_FAILED on an HTTP error response', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      })
    );

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Token exchange failed: 403 - forbidden',
    });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with TOKEN_EXCHANGE_FAILED and serves an error page on network failure', async () => {
    const { promise, state, handler } = await startFlow();
    const networkError = new Error('ENOTFOUND');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));
    const res = createRes();

    await handler({ code: 'auth-code', state }, res);

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Authentication failed: ENOTFOUND',
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
        json: async () => ({ token_type: 'bearer' }),
      })
    );

    await handler({ code: 'auth-code', state }, createRes());

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('ZendeskOAuth.startAuth - lifecycle', () => {
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
    createOAuthServerMock.mockRejectedValue(new OAuthError('port busy', 'PORT_IN_USE', 'Zendesk'));

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
