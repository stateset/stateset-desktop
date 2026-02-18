import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
  isSafeExternalUrl,
  isAllowedRendererNavigation,
  resolveCorsOrigin,
  isAllowedLocalCallbackTarget,
} from './url-security';

describe('isSafeExternalUrl', () => {
  it('allows allowed https hostnames', () => {
    expect(isSafeExternalUrl('https://stateset.dev')).toBe(true);
    expect(isSafeExternalUrl('https://api.sandbox.stateset.app')).toBe(true);
  });

  it('allows localhost http in development', () => {
    expect(isSafeExternalUrl('http://localhost:5173')).toBe(true);
    expect(isSafeExternalUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3000')).toBe(true);
    expect(isSafeExternalUrl('http://[::1]:5173')).toBe(true);
  });

  it('blocks localhost http with unexpected ports', () => {
    expect(isSafeExternalUrl('http://localhost:8080')).toBe(false);
    expect(isSafeExternalUrl('http://127.0.0.1:8080')).toBe(false);
    expect(isSafeExternalUrl('http://[::1]:8080')).toBe(false);
  });

  it('blocks URLs with embedded credentials', () => {
    expect(isSafeExternalUrl('https://user:pass@stateset.dev')).toBe(false);
    expect(isSafeExternalUrl('http://localhost:5173@stateset.dev')).toBe(false);
  });

  it('allows mailto links', () => {
    expect(isSafeExternalUrl('mailto:test@example.com')).toBe(true);
  });

  it('blocks risky protocols', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('blocks unsafe hosts', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(false);
    expect(isSafeExternalUrl('ftp://stateset.dev')).toBe(false);
  });

  it('keeps wildcard hostnames from matching allowed suffixes', () => {
    expect(isSafeExternalUrl('https://notstateset.dev')).toBe(false);
    expect(isSafeExternalUrl('https://evil.stateset.dev.attacker.com')).toBe(false);
  });

  it('normalizes hostnames for trailing dots', () => {
    expect(isSafeExternalUrl('https://stateset.dev.')).toBe(false);
    expect(isSafeExternalUrl('http://localhost:5173.')).toBe(false);
  });

  it('allows case-insensitive hostnames', () => {
    expect(isSafeExternalUrl('https://STATESet.Dev')).toBe(true);
  });

  it('ignores surrounding whitespace in URLs', () => {
    expect(isSafeExternalUrl('  https://stateset.dev  ')).toBe(true);
    expect(resolveCorsOrigin({ requestHeaders: { Origin: '  http://127.0.0.1:5173 ' } })).toBe(
      'http://127.0.0.1:5173'
    );
  });
});

describe('isAllowedRendererNavigation', () => {
  it('allows file URLs inside the renderer root', () => {
    const rendererRoot = path.join(process.cwd(), 'electron', 'renderer');
    const targetUrl = pathToFileURL(path.join(rendererRoot, 'index.html')).toString();
    expect(isAllowedRendererNavigation(targetUrl, rendererRoot)).toBe(true);
  });

  it('blocks file URLs outside the renderer root', () => {
    const rendererRoot = path.join(process.cwd(), 'electron', 'renderer');
    const targetUrl = pathToFileURL(path.join(rendererRoot, '..', 'main.ts')).toString();
    expect(isAllowedRendererNavigation(targetUrl, rendererRoot)).toBe(false);
  });

  it('blocks non-file URLs', () => {
    expect(isAllowedRendererNavigation('https://stateset.dev', '/tmp/renderer')).toBe(false);
  });

  it('normalizes encoded path traversal in file URLs', () => {
    const rendererRoot = path.join(process.cwd(), 'electron', 'renderer');
    const targetUrl = `file:///${path.resolve(rendererRoot).replace(/\\/g, '/')}/%2e%2e%2fmain.ts`;
    expect(isAllowedRendererNavigation(targetUrl, rendererRoot)).toBe(false);
  });
});

describe('resolveCorsOrigin', () => {
  it('uses allowed Origin header when provided', () => {
    const allowedOrigin = 'http://127.0.0.1:5173';
    expect(
      resolveCorsOrigin({
        requestHeaders: {
          Origin: allowedOrigin,
        },
      })
    ).toBe(allowedOrigin);
  });

  it('accepts local dev Origin values on alternate loopback hosts and port', () => {
    expect(
      resolveCorsOrigin({
        requestHeaders: { Origin: 'http://localhost:3000' },
      })
    ).toBe('http://localhost:3000');

    expect(
      resolveCorsOrigin({
        requestHeaders: { Origin: 'http://[::1]:3000' },
      })
    ).toBe('http://[::1]:3000');
  });

  it('falls back to referrer when origin is unavailable', () => {
    expect(
      resolveCorsOrigin({
        referrer: 'http://localhost:5173/path',
      })
    ).toBe('http://localhost:5173');
  });

  it('returns null for file referrer without allowed origin header', () => {
    expect(
      resolveCorsOrigin({
        referrer: 'file:///tmp/test/index.html',
      })
    ).toBe('null');
  });

  it('returns null when no allowed origin can be resolved', () => {
    expect(resolveCorsOrigin({ requestHeaders: { Origin: 'https://evil.com' } })).toBe('null');
  });

  it('ignores trailing slash in Origin header', () => {
    expect(
      resolveCorsOrigin({
        requestHeaders: {
          Origin: 'http://localhost:3000/',
        },
      })
    ).toBe('http://localhost:3000');
  });

  it('normalizes origin case', () => {
    expect(
      resolveCorsOrigin({
        requestHeaders: {
          origin: 'HTTP://LOCALHOST:5173',
        },
      })
    ).toBe('http://localhost:5173');
  });
});

describe('isAllowedLocalCallbackTarget', () => {
  it('allows valid localhost callback URLs', () => {
    const callback = new URL('http://localhost:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(true);
  });

  it('rejects unexpected callback ports', () => {
    const callback = new URL('http://localhost:9999/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(false);
  });

  it('rejects non-localhost hosts', () => {
    const callback = new URL('http://127.0.0.2:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(false);
  });

  it('rejects non-http callback schemes', () => {
    const callback = new URL('https://localhost:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(false);
  });

  it('rejects invalid expected callback port', () => {
    const callback = new URL('http://localhost:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, -1)).toBe(false);
    expect(isAllowedLocalCallbackTarget(callback, 70000)).toBe(false);
  });

  it('rejects wrong callback path', () => {
    const callback = new URL('http://localhost:8234/wrong');
    expect(isAllowedLocalCallbackTarget(callback, 8234, '/callback')).toBe(false);
  });

  it('allows IPv6 localhost callback URLs', () => {
    const callback = new URL('http://[::1]:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(true);
  });

  it('normalizes callback hostnames case-insensitively', () => {
    const callback = new URL('http://LOCALHOST:8234/callback');
    expect(isAllowedLocalCallbackTarget(callback, 8234)).toBe(true);
  });
});
