import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/electron/renderer';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { initializeLogger, log } from './lib/logger';
import { initializeTelemetry } from './lib/telemetry';
import './index.css';

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
  [
    /(?:api[-_]?key|api[_-]?secret|access[-_]?token|refresh[-_]?token|sandbox_api_key|engine_api_key|bearer|authorization)[^\s"']{0,120}/gi,
    '[REDACTED_TOKEN]',
  ],
  [/gh[pousr]_[A-Za-z0-9]{10,}/g, '[REDACTED_GITHUB_TOKEN]'],
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]'],
  [/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]'],
  [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]'],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function sanitizeSensitiveText(value: string): string {
  return SENSITIVE_PATTERNS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, value);
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeValue(item);
    }
    return output;
  }

  return value;
}

function sanitizeRequestQueryString(
  value: string | Record<string, string> | Array<[string, string]>
): string | Record<string, string> | Array<[string, string]> {
  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map(([key, item]: [string, string]): [string, string] => [
      sanitizeSensitiveText(key),
      sanitizeSensitiveText(item),
    ]);
  }

  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sanitizeSensitiveText(item);
  }
  return output;
}

function sanitizeStringRecord(value: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sanitizeSensitiveText(item);
  }
  return output;
}

// Initialize structured logging
initializeLogger();
log.info('Application starting', {
  version: import.meta.env.VITE_APP_VERSION || '1.0.1',
  environment: import.meta.env.MODE,
});

// Initialize telemetry (opt-in; will only activate if enabled in preferences)
initializeTelemetry({
  endpoint: import.meta.env.VITE_TELEMETRY_ENDPOINT,
});

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  // Initialize Sentry for the renderer process
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    beforeSend(event) {
      // Filter out events in development
      if (import.meta.env.DEV) {
        return null;
      }
      // Strip sensitive data from error event data and breadcrumbs
      if (event.message) {
        event.message = sanitizeSensitiveText(event.message);
      }
      if (event.transaction) {
        event.transaction = sanitizeSensitiveText(event.transaction);
      }
      if (event.extra) {
        event.extra = sanitizeValue(event.extra) as Record<string, unknown>;
      }
      if (event.tags) {
        event.tags = sanitizeValue(event.tags) as Record<string, string>;
      }
      if (event.request) {
        if (event.request.url) {
          event.request.url = sanitizeSensitiveText(event.request.url);
        }
        if (event.request.query_string) {
          event.request.query_string = sanitizeRequestQueryString(event.request.query_string);
        }
        if (event.request.headers) {
          event.request.headers = sanitizeStringRecord(event.request.headers);
        }
        if (event.request.data) {
          event.request.data = sanitizeValue(event.request.data) as Record<string, unknown>;
        }
        if (event.request.cookies) {
          event.request.cookies = sanitizeStringRecord(event.request.cookies);
        }
      }
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.message) {
            crumb.message = sanitizeSensitiveText(crumb.message);
          }
          if (crumb.data) {
            crumb.data = sanitizeValue(crumb.data) as Record<string, unknown>;
          }
        }
      }
      return event;
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
