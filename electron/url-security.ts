import * as path from 'path';
import { fileURLToPath } from 'url';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['mailto:']);
const SAFE_LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const CALLBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DANGEROUS_EXTERNAL_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'blob:']);
export const ALLOWED_HTTP_LOCALHOST_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://[::1]:5173',
  'http://[::1]:3000',
]);

const DEFAULT_API_URL = 'https://engine.stateset.cloud.stateset.app';

function getConfiguredApiOrigin(): string {
  const rawUrl = process.env.VITE_API_URL || process.env.API_URL || DEFAULT_API_URL;
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin;
  } catch {
    return new URL(DEFAULT_API_URL).origin;
  }
}

const configuredApiOrigin = getConfiguredApiOrigin();
const configuredApiHost = new URL(configuredApiOrigin).hostname.toLowerCase();

export const ALLOWED_EXTERNAL_HOSTNAMES = new Set([
  'api.sandbox.stateset.app',
  'engine.stateset.cloud.stateset.app',
  configuredApiHost,
  'stateset.io',
  'github.com',
  'stateset.dev',
  'docs.stateset.dev',
]);

export const ALLOWED_EXTERNAL_HOST_SUFFIXES = new Set([
  '.stateset.cloud.stateset.app',
  '.stateset.dev',
]);
export const ALLOWED_CORS_ORIGINS = new Set([...ALLOWED_HTTP_LOCALHOST_ORIGINS, 'null']);

export function getConfiguredApiEndpoint() {
  return configuredApiOrigin;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isSafeExternalUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl.trim());

    if (DANGEROUS_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }

    if (SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return true;
    }

    if (parsed.username || parsed.password) {
      return false;
    }

    if (parsed.protocol === 'http:') {
      if (!SAFE_LOCALHOST_HOSTNAMES.has(normalizeHostname(parsed.hostname))) {
        return false;
      }

      const localOrigin = `${parsed.protocol}//${parsed.host.toLowerCase()}`;
      return ALLOWED_HTTP_LOCALHOST_ORIGINS.has(localOrigin);
    }

    if (parsed.protocol !== 'https:') {
      return false;
    }

    const normalizedHost = normalizeHostname(parsed.hostname);
    if (ALLOWED_EXTERNAL_HOSTNAMES.has(normalizedHost)) {
      return true;
    }

    for (const suffix of ALLOWED_EXTERNAL_HOST_SUFFIXES) {
      if (normalizedHost === suffix.slice(1) || normalizedHost.endsWith(suffix)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(origin: string): boolean {
  return ALLOWED_CORS_ORIGINS.has(normalizeOrigin(origin));
}

export function resolveCorsOrigin(details: {
  requestHeaders?: Record<string, string | string[]>;
  referrer?: string;
}): string {
  const headers = details.requestHeaders ?? {};
  const originEntry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === 'origin'
  );
  const rawOrigin = originEntry ? originEntry[1] : undefined;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  const normalizedOrigin = normalizeOrigin(origin ?? '');

  if (normalizedOrigin && isAllowedCorsOrigin(normalizedOrigin)) {
    return normalizedOrigin;
  }

  const referrer = details.referrer?.trim();
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      if (isAllowedCorsOrigin(referrerUrl.origin)) {
        return referrerUrl.origin.toLowerCase();
      }
      if (referrerUrl.protocol === 'file:') {
        return 'null';
      }
    } catch {
      if (isAllowedCorsOrigin(referrer)) {
        return normalizeOrigin(referrer);
      }
    }
  }

  return 'null';
}

export function isAllowedRendererNavigation(targetUrl: string, rendererRoot: string): boolean {
  if (!targetUrl.startsWith('file://')) {
    return false;
  }

  try {
    const targetPath = normalizePath(fileURLToPath(targetUrl));
    const root = normalizePath(rendererRoot);
    const rootPrefix = `${root}${path.sep}`;
    return targetPath === root || targetPath.startsWith(rootPrefix);
  } catch {
    return false;
  }
}

export function isAllowedLocalCallbackTarget(
  callbackUrl: URL,
  expectedPort: number,
  expectedPath = '/callback'
): boolean {
  if (!Number.isSafeInteger(expectedPort) || expectedPort <= 0 || expectedPort > 65535) {
    return false;
  }

  if (callbackUrl.protocol !== 'http:') {
    return false;
  }

  const hostname = callbackUrl.hostname.toLowerCase();
  if (!CALLBACK_HOSTS.has(hostname)) {
    return false;
  }

  if (callbackUrl.pathname !== expectedPath) {
    return false;
  }

  const port = callbackUrl.port ? Number(callbackUrl.port) : expectedPort;
  return Number.isSafeInteger(port) && port > 0 && port <= 65535 && port === expectedPort;
}
