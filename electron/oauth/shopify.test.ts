import * as crypto from 'crypto';
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
import { ShopifyOAuth } from './shopify';

const createOAuthServerMock = vi.mocked(createOAuthServer);
const findAvailableOAuthPortMock = vi.mocked(findAvailableOAuthPort);
const openOAuthWindowMock = vi.mocked(openOAuthWindow);

type OAuthCallbackHandler = Parameters<typeof createOAuthServer>[1];

const CLIENT_ID = 'shopify-client-id';
const CLIENT_SECRET = 'shopify-client-secret';
const VALID_SHOP = 'mystore.myshopify.com';
const BASE_PORT = 8234;
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

/** Compute a valid Shopify HMAC for the given query, mirroring Shopify's signing scheme. */
function withHmac(
  query: Record<string, string>,
  secret: string = CLIENT_SECRET
): Record<string, string> {
  const message = Object.keys(query)
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join('&');
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return { ...query, hmac };
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function createOAuth() {
  return new ShopifyOAuth({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
}

async function startFlow(shop: string = VALID_SHOP) {
  const promise = createOAuth().startAuth(shop);
  // Prevent unhandled rejection warnings before the test asserts on the promise.
  promise.catch(() => undefined);
  await flushMicrotasks();
  expect(openOAuthWindowMock).toHaveBeenCalledTimes(1);
  expect(capturedHandler).toBeDefined();
  const authUrl = new URL(openOAuthWindowMock.mock.calls[0][0]);
  const state = authUrl.searchParams.get('state') ?? '';
  const handler = capturedHandler as OAuthCallbackHandler;
  return { promise, authUrl, state, handler };
}

function mockFetchToken(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
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

describe('ShopifyOAuth.startAuth - preconditions', () => {
  it('rejects with NOT_CONFIGURED when clientId is missing', async () => {
    const oauth = new ShopifyOAuth({ clientId: '', clientSecret: CLIENT_SECRET });
    await expect(oauth.startAuth(VALID_SHOP)).rejects.toMatchObject({
      name: 'OAuthError',
      code: 'NOT_CONFIGURED',
      provider: 'Shopify',
    });
    expect(createOAuthServerMock).not.toHaveBeenCalled();
  });

  it('rejects with NOT_CONFIGURED when clientSecret is missing', async () => {
    const oauth = new ShopifyOAuth({ clientId: CLIENT_ID, clientSecret: '' });
    await expect(oauth.startAuth(VALID_SHOP)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('rejects with INVALID_DOMAIN for non-myshopify domains', async () => {
    await expect(createOAuth().startAuth('example.com')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
      provider: 'Shopify',
    });
  });

  it('rejects with INVALID_DOMAIN for lookalike domains with a trailing suffix', async () => {
    await expect(createOAuth().startAuth('mystore.myshopify.com.evil.com')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
    });
  });

  it('rejects with INVALID_DOMAIN for domains starting with a hyphen', async () => {
    await expect(createOAuth().startAuth('-store.myshopify.com')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
    });
  });

  it('rejects with PORT_IN_USE when no callback port is available', async () => {
    findAvailableOAuthPortMock.mockResolvedValue(null);
    await expect(createOAuth().startAuth(VALID_SHOP)).rejects.toMatchObject({
      code: 'PORT_IN_USE',
    });
    expect(findAvailableOAuthPortMock).toHaveBeenCalledWith(BASE_PORT, 6);
  });
});

describe('ShopifyOAuth.startAuth - authorization URL', () => {
  it('builds the authorization URL with client id, scopes, redirect uri, and state', async () => {
    const { authUrl, state } = await startFlow();

    expect(authUrl.origin).toBe(`https://${VALID_SHOP}`);
    expect(authUrl.pathname).toBe('/admin/oauth/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authUrl.searchParams.get('scope')).toBe(
      'read_orders,write_orders,read_customers,write_customers,read_products,read_fulfillments,write_fulfillments'
    );
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`http://localhost:${BASE_PORT}/callback`);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('normalizes the shop domain by stripping protocol and trailing slash', async () => {
    const { authUrl } = await startFlow(`https://${VALID_SHOP}/`);
    expect(authUrl.origin).toBe(`https://${VALID_SHOP}`);
  });

  it('passes a hardened OAuth config to the server and window helpers', async () => {
    await startFlow();

    const serverConfig = createOAuthServerMock.mock.calls[0][0];
    expect(serverConfig).toMatchObject({
      provider: 'Shopify',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectPort: BASE_PORT,
      timeoutMs: TIMEOUT_MS,
      callbackPath: '/callback',
    });

    const [, windowConfig, onClosed] = openOAuthWindowMock.mock.calls[0];
    expect(windowConfig).toBe(serverConfig);
    expect(typeof onClosed).toBe('function');
  });
});

describe('ShopifyOAuth.startAuth - callback validation', () => {
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
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with MISSING_CODE when no authorization code is returned', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler({ state }, res);

    await expect(promise).rejects.toMatchObject({ code: 'MISSING_CODE' });
    expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'text/html' });
  });

  it('rejects oversized authorization codes', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler({ code: 'x'.repeat(2049), state }, res);

    await expect(promise).rejects.toMatchObject({
      code: 'MISSING_CODE',
      message: 'Authorization code is invalid',
    });
  });

  it('rejects with INVALID_DOMAIN when the returned shop does not match', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler({ code: 'abc', state, shop: 'https://other.myshopify.com' }, res);

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_DOMAIN' });
  });

  it('rejects with INVALID_RESPONSE when the HMAC is missing', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler({ code: 'abc', state, shop: VALID_SHOP }, res);

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: 'Invalid HMAC signature',
    });
  });

  it('rejects an HMAC of the correct length but wrong value (timing-safe comparison)', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();
    const query = withHmac({ code: 'abc', state, shop: VALID_SHOP, timestamp: '1700000000' });
    query.hmac = '0'.repeat(query.hmac.length);

    await handler(query, res);

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an HMAC of the wrong length without throwing (timingSafeEqual catch path)', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler({ code: 'abc', state, shop: VALID_SHOP, hmac: 'deadbeef' }, res);

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an HMAC signed with the wrong secret', async () => {
    const { promise, state, handler } = await startFlow();
    const res = createRes();

    await handler(withHmac({ code: 'abc', state, shop: VALID_SHOP }, 'wrong-secret'), res);

    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('ignores callbacks after the flow has settled', async () => {
    const { promise, handler } = await startFlow();
    await handler({ code: 'abc', state: 'tampered' }, createRes());
    await expect(promise).rejects.toMatchObject({ code: 'STATE_MISMATCH' });

    const res = createRes();
    await handler({ code: 'abc', state: 'tampered' }, res);
    expect(res.writeHead).not.toHaveBeenCalled();
  });
});

describe('ShopifyOAuth.startAuth - token exchange', () => {
  it('resolves credentials after a valid HMAC-signed callback and token exchange', async () => {
    const { promise, state, handler } = await startFlow(`https://${VALID_SHOP}/`);
    const fetchMock = mockFetchToken({ access_token: 'shpat_token', scope: 'read_orders' });
    const res = createRes();

    await handler(
      withHmac({ code: 'auth-code', state, shop: VALID_SHOP, timestamp: '1700000000' }),
      res
    );

    await expect(promise).resolves.toEqual({
      shop_domain: VALID_SHOP,
      access_token: 'shpat_token',
      scope: 'read_orders',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://${VALID_SHOP}/admin/oauth/access_token`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: 'auth-code',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('rejects with TOKEN_EXCHANGE_FAILED on an HTTP error response', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid client',
      })
    );

    await handler(withHmac({ code: 'auth-code', state, shop: VALID_SHOP }), createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Token exchange failed: 401 - invalid client',
    });
    expect(windowClose).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
  });

  it('falls back to a generic message when the error body cannot be read', async () => {
    const { promise, state, handler } = await startFlow();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('body read failed');
        },
      })
    );

    await handler(withHmac({ code: 'auth-code', state, shop: VALID_SHOP }), createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Token exchange failed: 500 - Unknown error',
    });
  });

  it('rejects with TOKEN_EXCHANGE_FAILED and serves an error page on network failure', async () => {
    const { promise, state, handler } = await startFlow();
    const networkError = new Error('socket hang up');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));
    const res = createRes();

    await handler(withHmac({ code: 'auth-code', state, shop: VALID_SHOP }), res);

    await expect(promise).rejects.toMatchObject({
      code: 'TOKEN_EXCHANGE_FAILED',
      message: 'Authentication failed: socket hang up',
      cause: networkError,
    });
    expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'text/html' });
  });

  it('rejects with INVALID_RESPONSE when the response has no access token', async () => {
    const { promise, state, handler } = await startFlow();
    mockFetchToken({ scope: 'read_orders' });

    await handler(withHmac({ code: 'auth-code', state, shop: VALID_SHOP }), createRes());

    await expect(promise).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: 'No access token in response',
    });
  });
});

describe('ShopifyOAuth.startAuth - lifecycle', () => {
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
    createOAuthServerMock.mockRejectedValue(new OAuthError('port busy', 'PORT_IN_USE', 'Shopify'));

    await expect(createOAuth().startAuth(VALID_SHOP)).rejects.toMatchObject({
      code: 'PORT_IN_USE',
      message: 'port busy',
    });
  });

  it('wraps unknown server creation failures as NETWORK_ERROR', async () => {
    createOAuthServerMock.mockRejectedValue(new Error('listen failed'));

    await expect(createOAuth().startAuth(VALID_SHOP)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Authentication failed: listen failed',
    });
  });
});
