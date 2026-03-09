import { describe, it, expect, vi, beforeEach } from 'vitest';

const { BrowserWindowMock, browserWindowInstances, shellOpenExternal } = vi.hoisted(() => {
  const browserWindowInstances: Array<{
    options: Electron.BrowserWindowConstructorOptions;
    loadURL: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    webContents: {
      on: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
  }> = [];

  class BrowserWindowMock {
    loadURL = vi.fn();
    on = vi.fn();
    webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };

    constructor(public options: Electron.BrowserWindowConstructorOptions) {
      browserWindowInstances.push(this);
    }
  }

  return {
    BrowserWindowMock,
    browserWindowInstances,
    shellOpenExternal: vi.fn(),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  shell: {
    openExternal: shellOpenExternal,
  },
}));

import {
  OAuthError,
  type OAuthErrorCode,
  getSuccessHtml,
  getErrorHtml,
  getQueryValue,
  isValidSubdomain,
  getOAuthErrorMessage,
  getOAuthSessionPartition,
  openOAuthWindow,
} from './utils';

beforeEach(() => {
  browserWindowInstances.length = 0;
  shellOpenExternal.mockReset();
});

describe('OAuthError', () => {
  it('should create an error with correct properties', () => {
    const error = new OAuthError('Test error', 'NETWORK_ERROR', 'Shopify');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.provider).toBe('Shopify');
    expect(error.name).toBe('OAuthError');
    expect(error.cause).toBeUndefined();
  });

  it('should include cause when provided', () => {
    const cause = new Error('Original error');
    const error = new OAuthError('Wrapped error', 'TOKEN_EXCHANGE_FAILED', 'Zendesk', cause);
    expect(error.cause).toBe(cause);
  });

  it('should be instance of Error', () => {
    const error = new OAuthError('Test', 'TIMEOUT', 'Gorgias');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OAuthError);
  });
});

describe('getSuccessHtml', () => {
  it('should include provider name in title', () => {
    const html = getSuccessHtml('Shopify');
    expect(html).toContain('<title>Connected to Shopify</title>');
  });

  it('should include provider name in heading', () => {
    const html = getSuccessHtml('Gorgias');
    expect(html).toContain('Connected to Gorgias!');
  });

  it('should include success checkmark icon', () => {
    const html = getSuccessHtml('Zendesk');
    expect(html).toContain('&#x2713;'); // Checkmark character
  });

  it('should include instruction to close window', () => {
    const html = getSuccessHtml('Shopify');
    expect(html).toContain('You can close this window');
  });

  it('should be valid HTML structure', () => {
    const html = getSuccessHtml('Test');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });
});

describe('getErrorHtml', () => {
  it('should include error message', () => {
    const html = getErrorHtml('Shopify', 'Token exchange failed');
    expect(html).toContain('Token exchange failed');
  });

  it('should include provider name', () => {
    const html = getErrorHtml('Gorgias', 'Some error');
    expect(html).toContain('Could not connect to Gorgias');
  });

  it('should include X icon', () => {
    const html = getErrorHtml('Zendesk', 'Error');
    expect(html).toContain('&#x2717;'); // X character
  });

  it('should have error styling', () => {
    const html = getErrorHtml('Test', 'Error');
    expect(html).toContain('class="error"');
    expect(html).toContain('color: #ef4444'); // Red color for heading
  });

  it('should be valid HTML structure', () => {
    const html = getErrorHtml('Test', 'Error');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });
});

describe('getQueryValue', () => {
  it('should return string value directly', () => {
    const query = { code: 'abc123', state: 'xyz' };
    expect(getQueryValue(query, 'code')).toBe('abc123');
    expect(getQueryValue(query, 'state')).toBe('xyz');
  });

  it('should return first element of array', () => {
    const query = { code: ['first', 'second'] };
    expect(getQueryValue(query, 'code')).toBe('first');
  });

  it('should return undefined for missing key', () => {
    const query = { code: 'abc' };
    expect(getQueryValue(query, 'missing')).toBeUndefined();
  });

  it('should return undefined for undefined value', () => {
    const query: Record<string, string | string[] | undefined> = { code: undefined };
    expect(getQueryValue(query, 'code')).toBeUndefined();
  });

  it('should handle empty array', () => {
    const query = { code: [] as string[] };
    expect(getQueryValue(query, 'code')).toBeUndefined();
  });
});

describe('getOAuthSessionPartition', () => {
  it('creates a stable in-memory partition name per provider', () => {
    expect(getOAuthSessionPartition('Shopify')).toBe('oauth-shopify');
    expect(getOAuthSessionPartition('StateSet OAuth Provider')).toBe(
      'oauth-stateset-oauth-provider'
    );
  });
});

describe('openOAuthWindow', () => {
  it('uses an isolated partition and hardened web preferences', () => {
    const onClosed = vi.fn();

    openOAuthWindow(
      'https://accounts.example.com/auth',
      {
        provider: 'Shopify',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectPort: 8234,
        timeoutMs: 5_000,
        callbackPath: '/callback',
      },
      onClosed
    );

    expect(browserWindowInstances).toHaveLength(1);
    const window = browserWindowInstances[0];

    expect(window.options.webPreferences?.partition).toBe('oauth-shopify');
    expect(window.options.webPreferences?.webviewTag).toBe(false);
    expect(window.options.webPreferences?.sandbox).toBe(true);
    expect(window.loadURL).toHaveBeenCalledWith('https://accounts.example.com/auth');
    expect(window.on).toHaveBeenCalledWith('closed', onClosed);
    expect(window.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('allows https and localhost callback navigation but blocks unsafe schemes', () => {
    openOAuthWindow(
      'https://accounts.example.com/auth',
      {
        provider: 'Gorgias',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectPort: 8235,
        timeoutMs: 5_000,
        callbackPath: '/callback',
      },
      vi.fn()
    );

    const window = browserWindowInstances[0];
    const navigationHandler = window.webContents.on.mock.calls.find(
      ([eventName]) => eventName === 'will-navigate'
    )?.[1] as (event: { preventDefault: () => void }, url: string) => void;

    const safeHttpsEvent = { preventDefault: vi.fn() };
    navigationHandler(safeHttpsEvent, 'https://accounts.example.com/login');
    expect(safeHttpsEvent.preventDefault).not.toHaveBeenCalled();

    const callbackEvent = { preventDefault: vi.fn() };
    navigationHandler(callbackEvent, 'http://localhost:8235/callback?code=123');
    expect(callbackEvent.preventDefault).not.toHaveBeenCalled();

    const unsafeEvent = { preventDefault: vi.fn() };
    navigationHandler(unsafeEvent, 'file:///tmp/evil.html');
    expect(unsafeEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('denies popups and opens safe https targets externally', () => {
    openOAuthWindow(
      'https://accounts.example.com/auth',
      {
        provider: 'Zendesk',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectPort: 8236,
        timeoutMs: 5_000,
        callbackPath: '/callback',
      },
      vi.fn()
    );

    const window = browserWindowInstances[0];
    const popupHandler = window.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: {
      url: string;
    }) => { action: 'deny' | 'allow' };

    expect(popupHandler({ url: 'https://help.example.com' })).toEqual({ action: 'deny' });
    expect(shellOpenExternal).toHaveBeenCalledWith('https://help.example.com');

    shellOpenExternal.mockClear();
    expect(popupHandler({ url: 'http://localhost:8236/callback?code=123' })).toEqual({
      action: 'deny',
    });
    expect(shellOpenExternal).not.toHaveBeenCalled();

    expect(popupHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(shellOpenExternal).not.toHaveBeenCalled();
  });
});

describe('isValidSubdomain', () => {
  describe('valid subdomains', () => {
    it('should accept simple alphanumeric subdomains', () => {
      expect(isValidSubdomain('mystore')).toBe(true);
      expect(isValidSubdomain('store123')).toBe(true);
      expect(isValidSubdomain('123store')).toBe(true);
    });

    it('should accept subdomains with hyphens', () => {
      expect(isValidSubdomain('my-store')).toBe(true);
      expect(isValidSubdomain('my-cool-store')).toBe(true);
    });

    it('should accept single character subdomains', () => {
      expect(isValidSubdomain('a')).toBe(true);
      expect(isValidSubdomain('1')).toBe(true);
    });

    it('should accept subdomains up to 63 characters', () => {
      const longValid = 'a'.repeat(63);
      expect(isValidSubdomain(longValid)).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isValidSubdomain('MyStore')).toBe(true);
      expect(isValidSubdomain('MYSTORE')).toBe(true);
    });
  });

  describe('invalid subdomains', () => {
    it('should reject empty string', () => {
      expect(isValidSubdomain('')).toBe(false);
    });

    it('should reject subdomains starting with hyphen', () => {
      expect(isValidSubdomain('-mystore')).toBe(false);
    });

    it('should reject subdomains ending with hyphen', () => {
      expect(isValidSubdomain('mystore-')).toBe(false);
    });

    it('should reject subdomains with special characters', () => {
      expect(isValidSubdomain('my_store')).toBe(false);
      expect(isValidSubdomain('my.store')).toBe(false);
      expect(isValidSubdomain('my@store')).toBe(false);
      expect(isValidSubdomain('my store')).toBe(false);
    });

    it('should reject subdomains over 63 characters', () => {
      const tooLong = 'a'.repeat(64);
      expect(isValidSubdomain(tooLong)).toBe(false);
    });
  });
});

describe('getOAuthErrorMessage', () => {
  const createError = (code: string, provider: string = 'Shopify') =>
    new OAuthError('Internal message', code as OAuthErrorCode, provider);

  it('should return correct message for NOT_CONFIGURED', () => {
    const msg = getOAuthErrorMessage(createError('NOT_CONFIGURED'));
    expect(msg).toContain('not configured');
    expect(msg).toContain('Shopify');
  });

  it('should return correct message for INVALID_DOMAIN', () => {
    const msg = getOAuthErrorMessage(createError('INVALID_DOMAIN', 'Zendesk'));
    expect(msg).toContain('domain');
    expect(msg).toContain('invalid');
    expect(msg).toContain('Zendesk');
  });

  it('should return correct message for STATE_MISMATCH', () => {
    const msg = getOAuthErrorMessage(createError('STATE_MISMATCH'));
    expect(msg).toContain('Security validation failed');
  });

  it('should return correct message for MISSING_CODE', () => {
    const msg = getOAuthErrorMessage(createError('MISSING_CODE'));
    expect(msg).toContain('Authorization was not completed');
  });

  it('should return correct message for TOKEN_EXCHANGE_FAILED', () => {
    const msg = getOAuthErrorMessage(createError('TOKEN_EXCHANGE_FAILED', 'Gorgias'));
    expect(msg).toContain('authentication');
    expect(msg).toContain('Gorgias');
  });

  it('should return correct message for PORT_IN_USE', () => {
    const msg = getOAuthErrorMessage(createError('PORT_IN_USE'));
    expect(msg).toContain('authentication server');
    expect(msg).toContain('close other applications');
  });

  it('should return correct message for TIMEOUT', () => {
    const msg = getOAuthErrorMessage(createError('TIMEOUT'));
    expect(msg).toContain('timed out');
  });

  it('should return correct message for USER_CANCELLED', () => {
    const msg = getOAuthErrorMessage(createError('USER_CANCELLED'));
    expect(msg).toContain('cancelled');
  });

  it('should return correct message for NETWORK_ERROR', () => {
    const msg = getOAuthErrorMessage(createError('NETWORK_ERROR'));
    expect(msg).toContain('Network error');
    expect(msg).toContain('connection');
  });

  it('should return correct message for INVALID_RESPONSE', () => {
    const msg = getOAuthErrorMessage(createError('INVALID_RESPONSE', 'Zendesk'));
    expect(msg).toContain('unexpected response');
    expect(msg).toContain('Zendesk');
  });

  it('should return generic message for unknown error code', () => {
    const error = new OAuthError('Unknown', 'UNKNOWN_CODE' as OAuthErrorCode, 'Shopify');
    const msg = getOAuthErrorMessage(error);
    expect(msg).toContain('error occurred');
    expect(msg).toContain('Shopify');
  });
});
