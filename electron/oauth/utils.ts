import { BrowserWindow } from 'electron';
import * as http from 'http';
import { isAllowedLocalCallbackTarget } from '../url-security';

/**
 * Standard OAuth error types for consistent error handling
 */
export class OAuthError extends Error {
  constructor(
    message: string,
    public readonly code: OAuthErrorCode,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

export type OAuthErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_DOMAIN'
  | 'STATE_MISMATCH'
  | 'MISSING_CODE'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'PORT_IN_USE'
  | 'TIMEOUT'
  | 'USER_CANCELLED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';

/**
 * Configuration for OAuth flow
 */
export interface OAuthConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  redirectPort: number;
  timeoutMs: number;
  windowOptions?: Partial<Electron.BrowserWindowConstructorOptions>;
  callbackPath?: string;
}

/**
 * Success HTML template for OAuth callback
 */
export function getSuccessHtml(provider: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Connected to ${provider}</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #030712;
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          h1 {
            margin-bottom: 0.5rem;
            color: #10b981;
          }
          p {
            color: #9ca3af;
          }
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">&#x2713;</div>
          <h1>Connected to ${provider}!</h1>
          <p>You can close this window and return to StateSet.</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Error HTML template for OAuth callback
 */
export function getErrorHtml(provider: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Connection Failed</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #030712;
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            max-width: 400px;
          }
          h1 {
            margin-bottom: 0.5rem;
            color: #ef4444;
          }
          p {
            color: #9ca3af;
          }
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          .error {
            background: #1f2937;
            border-radius: 0.5rem;
            padding: 1rem;
            margin-top: 1rem;
            font-size: 0.875rem;
            color: #fca5a5;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">&#x2717;</div>
          <h1>Connection Failed</h1>
          <p>Could not connect to ${provider}.</p>
          <div class="error">${message}</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Creates an OAuth server and manages the flow lifecycle
 */
export function createOAuthServer(
  config: OAuthConfig,
  handleCallback: (
    query: Record<string, string | string[] | undefined>,
    res: http.ServerResponse
  ) => Promise<void>
): Promise<{ server: http.Server; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    let callbackHandled = false;
    const server = http.createServer(async (req, res) => {
      if (req.method?.toUpperCase() !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method not allowed');
        return;
      }

      if (callbackHandled) {
        res.writeHead(409, { 'Content-Type': 'text/plain' });
        res.end('Callback already completed');
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(req.url || '', `http://localhost:${config.redirectPort}`);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid callback request');
        return;
      }

      if (!isAllowedLocalCallbackTarget(parsedUrl, config.redirectPort, config.callbackPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Invalid callback target');
        return;
      }

      callbackHandled = true;

      const query: Record<string, string | string[] | undefined> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      try {
        await handleCallback(query, res);
      } catch {
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Callback handling failed');
        }
      }
    });

    const cleanup = () => {
      server.close();
    };

    server.on('error', (error) => {
      cleanup();
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EADDRINUSE') {
        reject(
          new OAuthError(
            `OAuth port ${config.redirectPort} is already in use. Please close other applications using this port and try again.`,
            'PORT_IN_USE',
            config.provider,
            error
          )
        );
        return;
      }
      reject(
        new OAuthError(
          `Failed to start OAuth server: ${error.message}`,
          'NETWORK_ERROR',
          config.provider,
          error
        )
      );
    });

    server.listen(config.redirectPort, 'localhost', () => {
      resolve({ server, cleanup });
    });
  });
}

/**
 * Opens OAuth window and manages its lifecycle
 */
export function openOAuthWindow(
  authUrl: string,
  config: OAuthConfig,
  onClosed: () => void
): BrowserWindow {
  const window = new BrowserWindow({
    width: 600,
    height: 700,
    autoHideMenuBar: true,
    title: `Sign in to ${config.provider}`,
    ...config.windowOptions,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      ...config.windowOptions?.webPreferences,
    },
  });

  window.loadURL(authUrl);
  window.on('closed', onClosed);

  return window;
}

/**
 * Helper to get a single query value
 */
export function getQueryValue(
  query: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Validates a subdomain format
 */
export function isValidSubdomain(subdomain: string): boolean {
  const pattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return pattern.test(subdomain);
}

/**
 * Get user-friendly error message for OAuth errors
 */
export function getOAuthErrorMessage(error: OAuthError): string {
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return `${error.provider} integration is not configured. Please contact support.`;
    case 'INVALID_DOMAIN':
      return `The ${error.provider} domain or subdomain you entered is invalid. Please check and try again.`;
    case 'STATE_MISMATCH':
      return `Security validation failed. Please try connecting again.`;
    case 'MISSING_CODE':
      return `Authorization was not completed. Please try connecting again.`;
    case 'TOKEN_EXCHANGE_FAILED':
      return `Failed to complete authentication with ${error.provider}. Please try again.`;
    case 'PORT_IN_USE':
      return `Cannot start authentication server. Please close other applications and try again.`;
    case 'TIMEOUT':
      return `Connection timed out. Please try again.`;
    case 'USER_CANCELLED':
      return `Connection was cancelled.`;
    case 'NETWORK_ERROR':
      return `Network error occurred. Please check your connection and try again.`;
    case 'INVALID_RESPONSE':
      return `Received an unexpected response from ${error.provider}. Please try again.`;
    default:
      return `An error occurred while connecting to ${error.provider}.`;
  }
}
