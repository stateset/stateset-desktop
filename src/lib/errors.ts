/**
 * Error Categories for better user experience
 */
export enum ErrorCategory {
  /** Network-related errors (connectivity, timeout) */
  NETWORK = 'network',
  /** Authentication/Authorization errors */
  AUTH = 'auth',
  /** Server-side errors (5xx) */
  SERVER = 'server',
  /** Client-side errors (4xx) */
  CLIENT = 'client',
  /** Rate limiting errors */
  RATE_LIMIT = 'rate_limit',
  /** Validation errors */
  VALIDATION = 'validation',
  /** Unknown/unclassified errors */
  UNKNOWN = 'unknown',
}

/**
 * Structured application error with categorization
 */
export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly errorCause?: Error;

  constructor(
    message: string,
    options: {
      category?: ErrorCategory;
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.category = options.category ?? ErrorCategory.UNKNOWN;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.errorCause = options.cause;
  }

  static fromHttpStatus(status: number, message?: string): AppError {
    const defaultMessages: Record<number, string> = {
      400: 'Invalid request',
      401: 'Please log in to continue',
      403: "You don't have permission to do this",
      404: 'The requested resource was not found',
      408: 'Request timed out',
      429: 'Too many requests. Please try again later',
      500: 'Server error. Please try again',
      502: 'Service temporarily unavailable',
      503: 'Service is currently unavailable',
      504: 'Request timed out. Please try again',
    };

    const category = categorizeHttpStatus(status);
    const retryable = isRetryableStatus(status);

    return new AppError(message || defaultMessages[status] || `HTTP ${status}`, {
      category,
      statusCode: status,
      retryable,
      code: `HTTP_${status}`,
    });
  }

  static network(message: string = 'Network connection error'): AppError {
    return new AppError(message, {
      category: ErrorCategory.NETWORK,
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  }

  static timeout(message: string = 'Request timed out'): AppError {
    return new AppError(message, {
      category: ErrorCategory.NETWORK,
      code: 'TIMEOUT',
      retryable: true,
    });
  }

  static auth(message: string = 'Authentication required'): AppError {
    return new AppError(message, {
      category: ErrorCategory.AUTH,
      code: 'AUTH_REQUIRED',
      retryable: false,
    });
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, {
      category: ErrorCategory.VALIDATION,
      code: 'VALIDATION_ERROR',
      retryable: false,
      details,
    });
  }
}

/**
 * Categorize HTTP status codes
 */
function categorizeHttpStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) return ErrorCategory.AUTH;
  if (status === 429) return ErrorCategory.RATE_LIMIT;
  if (status >= 400 && status < 500) return ErrorCategory.CLIENT;
  if (status >= 500) return ErrorCategory.SERVER;
  return ErrorCategory.UNKNOWN;
}

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Extract a user-friendly error message from any error type
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    // Clean up common error message patterns
    const msg = error.message;

    // Handle fetch errors
    if (msg.includes('Failed to fetch') || msg.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }

    // Handle timeout errors
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return 'The request took too long. Please try again.';
    }

    // Handle network errors
    if (msg.includes('network') || msg.includes('Network')) {
      return 'Network error. Please check your connection.';
    }

    return msg;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Get error category from any error type
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof AppError) {
    return error.category;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('fetch') || msg.includes('network') || msg.includes('offline')) {
      return ErrorCategory.NETWORK;
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return ErrorCategory.NETWORK;
    }
    if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('auth')) {
      return ErrorCategory.AUTH;
    }
    if (msg.includes('forbidden') || msg.includes('403')) {
      return ErrorCategory.AUTH;
    }
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
      return ErrorCategory.RATE_LIMIT;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  const category = getErrorCategory(error);
  return (
    category === ErrorCategory.NETWORK ||
    category === ErrorCategory.RATE_LIMIT ||
    category === ErrorCategory.SERVER
  );
}

/**
 * Get a suggested action for an error
 */
export function getErrorAction(error: unknown): {
  label: string;
  action: 'retry' | 'login' | 'contact' | 'dismiss';
} {
  const category = getErrorCategory(error);

  switch (category) {
    case ErrorCategory.NETWORK:
      return { label: 'Try Again', action: 'retry' };
    case ErrorCategory.AUTH:
      return { label: 'Log In', action: 'login' };
    case ErrorCategory.SERVER:
      return { label: 'Try Again', action: 'retry' };
    case ErrorCategory.RATE_LIMIT:
      return { label: 'Wait and Retry', action: 'retry' };
    case ErrorCategory.VALIDATION:
      return { label: 'Dismiss', action: 'dismiss' };
    default:
      return { label: 'Contact Support', action: 'contact' };
  }
}

/**
 * Format error for logging (includes more technical details)
 */
export function formatErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      category: error.category,
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      details: error.details,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      category: getErrorCategory(error),
    };
  }

  return {
    value: String(error),
    type: typeof error,
  };
}
