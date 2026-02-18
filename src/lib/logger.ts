/**
 * Structured Logging System
 *
 * Provides a consistent, structured logging API for the application.
 * Logs are formatted as JSON for easy parsing and analysis.
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Structured metadata
 * - Session/request context
 * - Performance timing
 * - Environment-aware output
 * - Log buffering for batch export
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration_ms?: number;
}

const LOG_SENSITIVE_KEYS = new Set([
  'apikey',
  'api',
  'token',
  'password',
  'secret',
  'credential',
  'authorization',
  'cookie',
  'session',
  'refresh',
  'email',
]);

export interface LoggerOptions {
  context?: string;
  metadata?: Record<string, unknown>;
}

// Environment detection
const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === 'test';

// Log level priority
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'info';

// In-memory log buffer for export
const LOG_BUFFER_MAX_SIZE = 1000;
let logBuffer: LogEntry[] = [];

// Session ID for correlating logs
let sessionId: string | null = null;

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Initialize logger with a new session
 */
export function initializeLogger(): void {
  sessionId = generateSessionId();
  logBuffer = [];
  log.info('Logger initialized', { sessionId });
}

/**
 * Get the current session ID
 */
export function getSessionId(): string | null {
  return sessionId;
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  if (isTest) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

/**
 * Format an error object for logging
 */
function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function sanitizeLogValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }
  if (typeof value === 'object') {
    const sanitized = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(sanitized)) {
      const lowerKey = key.toLowerCase();
      if ([...LOG_SENSITIVE_KEYS].some((token) => lowerKey.includes(token))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeLogValue(entry);
      }
    }
    return out;
  }
  return undefined;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return sanitizeLogValue(metadata) as Record<string, unknown>;
}

/**
 * Add entry to buffer
 */
function addToBuffer(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX_SIZE) {
    logBuffer.shift();
  }
}

/**
 * Output log entry to console
 */
function outputLog(entry: LogEntry): void {
  const { level, message, context, metadata, error, duration_ms } = entry;

  // Build console message
  const prefix = context ? `[${context}]` : '';
  const durationSuffix = duration_ms !== undefined ? ` (${duration_ms}ms)` : '';
  const fullMessage = `${prefix} ${message}${durationSuffix}`.trim();

  // Select console method
  const consoleMethods: Record<LogLevel, typeof console.log> = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  const consoleMethod = consoleMethods[level];

  // In development, use readable format
  if (isDev) {
    if (error) {
      consoleMethod(fullMessage, metadata || '', error);
    } else if (metadata && Object.keys(metadata).length > 0) {
      consoleMethod(fullMessage, metadata);
    } else {
      consoleMethod(fullMessage);
    }
  } else {
    // In production, use JSON format for log aggregation
    consoleMethod(JSON.stringify(entry));
  }
}

/**
 * Create a log entry and output it
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  options?: LoggerOptions & { error?: unknown; duration_ms?: number }
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: options?.context,
    metadata: {
      ...options?.metadata,
      ...(sanitizeMetadata(options?.metadata) ?? {}),
      sessionId,
    },
    error: formatError(options?.error),
    duration_ms: options?.duration_ms,
  };

  addToBuffer(entry);

  if (shouldLog(level)) {
    outputLog(entry);
  }

  return entry;
}

/**
 * Main logger object
 */
export const log = {
  debug(message: string, metadata?: Record<string, unknown>): LogEntry {
    return createLogEntry('debug', message, { metadata });
  },

  info(message: string, metadata?: Record<string, unknown>): LogEntry {
    return createLogEntry('info', message, { metadata });
  },

  warn(message: string, metadata?: Record<string, unknown>): LogEntry {
    return createLogEntry('warn', message, { metadata });
  },

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): LogEntry {
    return createLogEntry('error', message, { error, metadata });
  },

  /**
   * Create a child logger with a specific context
   */
  child(context: string, defaultMetadata?: Record<string, unknown>) {
    return {
      debug: (message: string, metadata?: Record<string, unknown>) =>
        createLogEntry('debug', message, {
          context,
          metadata: { ...defaultMetadata, ...metadata },
        }),

      info: (message: string, metadata?: Record<string, unknown>) =>
        createLogEntry('info', message, {
          context,
          metadata: { ...defaultMetadata, ...metadata },
        }),

      warn: (message: string, metadata?: Record<string, unknown>) =>
        createLogEntry('warn', message, {
          context,
          metadata: { ...defaultMetadata, ...metadata },
        }),

      error: (message: string, error?: unknown, metadata?: Record<string, unknown>) =>
        createLogEntry('error', message, {
          context,
          error,
          metadata: { ...defaultMetadata, ...metadata },
        }),

      /**
       * Time an async operation
       */
      async time<T>(
        label: string,
        operation: () => Promise<T>,
        metadata?: Record<string, unknown>
      ): Promise<T> {
        const start = performance.now();
        try {
          const result = await operation();
          const duration_ms = Math.round(performance.now() - start);
          createLogEntry('info', `${label} completed`, {
            context,
            duration_ms,
            metadata: { ...defaultMetadata, ...metadata },
          });
          return result;
        } catch (error) {
          const duration_ms = Math.round(performance.now() - start);
          createLogEntry('error', `${label} failed`, {
            context,
            error,
            duration_ms,
            metadata: { ...defaultMetadata, ...metadata },
          });
          throw error;
        }
      },
    };
  },

  /**
   * Time an async operation
   */
  async time<T>(
    label: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration_ms = Math.round(performance.now() - start);
      createLogEntry('info', `${label} completed`, { duration_ms, metadata });
      return result;
    } catch (error) {
      const duration_ms = Math.round(performance.now() - start);
      createLogEntry('error', `${label} failed`, { error, duration_ms, metadata });
      throw error;
    }
  },
};

/**
 * Get the log buffer for export
 */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Clear the log buffer
 */
export function clearLogBuffer(): void {
  logBuffer = [];
}

/**
 * Export logs as JSON
 */
export function exportLogsAsJson(): string {
  return JSON.stringify(logBuffer, null, 2);
}

/**
 * Export logs as a downloadable file
 */
export function downloadLogs(): void {
  const blob = new Blob([exportLogsAsJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stateset-logs-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Pre-defined loggers for common contexts
export const apiLogger = log.child('API');
export const authLogger = log.child('Auth');
export const agentLogger = log.child('Agent');
export const streamLogger = log.child('Stream');
export const cacheLogger = log.child('Cache');
export const uiLogger = log.child('UI');

// Export default
export default log;
