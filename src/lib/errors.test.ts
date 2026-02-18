import { describe, it, expect } from 'vitest';
import {
  AppError,
  ErrorCategory,
  getErrorMessage,
  getErrorCategory,
  isRetryableError,
  getErrorAction,
  formatErrorForLog,
} from './errors';

describe('AppError', () => {
  it('should create an error with default values', () => {
    const error = new AppError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.category).toBe(ErrorCategory.UNKNOWN);
    expect(error.retryable).toBe(false);
    expect(error.name).toBe('AppError');
  });

  it('should create an error with custom options', () => {
    const error = new AppError('Custom error', {
      category: ErrorCategory.NETWORK,
      code: 'NETWORK_TIMEOUT',
      statusCode: 408,
      retryable: true,
      details: { url: '/api/test' },
    });

    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.code).toBe('NETWORK_TIMEOUT');
    expect(error.statusCode).toBe(408);
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ url: '/api/test' });
  });

  describe('fromHttpStatus', () => {
    it('should create auth error for 401', () => {
      const error = AppError.fromHttpStatus(401);
      expect(error.category).toBe(ErrorCategory.AUTH);
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
    });

    it('should create auth error for 403', () => {
      const error = AppError.fromHttpStatus(403);
      expect(error.category).toBe(ErrorCategory.AUTH);
      expect(error.statusCode).toBe(403);
    });

    it('should create rate limit error for 429', () => {
      const error = AppError.fromHttpStatus(429);
      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(error.retryable).toBe(true);
    });

    it('should create server error for 500', () => {
      const error = AppError.fromHttpStatus(500);
      expect(error.category).toBe(ErrorCategory.SERVER);
      expect(error.retryable).toBe(true);
    });

    it('should create client error for 404', () => {
      const error = AppError.fromHttpStatus(404);
      expect(error.category).toBe(ErrorCategory.CLIENT);
      expect(error.retryable).toBe(false);
    });

    it('should use custom message when provided', () => {
      const error = AppError.fromHttpStatus(500, 'Custom server error');
      expect(error.message).toBe('Custom server error');
    });
  });

  describe('static factory methods', () => {
    it('should create network error', () => {
      const error = AppError.network();
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
    });

    it('should create timeout error', () => {
      const error = AppError.timeout();
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
    });

    it('should create auth error', () => {
      const error = AppError.auth();
      expect(error.category).toBe(ErrorCategory.AUTH);
      expect(error.retryable).toBe(false);
    });

    it('should create validation error', () => {
      const error = AppError.validation('Invalid input', { field: 'email' });
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.details).toEqual({ field: 'email' });
    });
  });
});

describe('getErrorMessage', () => {
  it('should return message from AppError', () => {
    const error = new AppError('App error message');
    expect(getErrorMessage(error)).toBe('App error message');
  });

  it('should return message from regular Error', () => {
    const error = new Error('Regular error');
    expect(getErrorMessage(error)).toBe('Regular error');
  });

  it('should return string errors directly', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should return fallback for unknown types', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
    expect(getErrorMessage(undefined)).toBe('Something went wrong');
    expect(getErrorMessage(123)).toBe('Something went wrong');
  });

  it('should use custom fallback', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });

  it('should clean up fetch errors', () => {
    const error = new Error('Failed to fetch');
    const message = getErrorMessage(error);
    expect(message).toContain('connect');
  });

  it('should clean up timeout errors', () => {
    const error = new Error('Request timed out');
    const message = getErrorMessage(error);
    expect(message).toContain('long');
  });
});

describe('getErrorCategory', () => {
  it('should return category from AppError', () => {
    const error = new AppError('Test', { category: ErrorCategory.SERVER });
    expect(getErrorCategory(error)).toBe(ErrorCategory.SERVER);
  });

  it('should detect network errors', () => {
    expect(getErrorCategory(new Error('Network error'))).toBe(ErrorCategory.NETWORK);
    expect(getErrorCategory(new Error('Failed to fetch'))).toBe(ErrorCategory.NETWORK);
  });

  it('should detect auth errors', () => {
    expect(getErrorCategory(new Error('Unauthorized'))).toBe(ErrorCategory.AUTH);
    expect(getErrorCategory(new Error('401'))).toBe(ErrorCategory.AUTH);
    expect(getErrorCategory(new Error('Forbidden 403'))).toBe(ErrorCategory.AUTH);
  });

  it('should detect rate limit errors', () => {
    expect(getErrorCategory(new Error('Rate limit exceeded'))).toBe(ErrorCategory.RATE_LIMIT);
    expect(getErrorCategory(new Error('429 too many requests'))).toBe(ErrorCategory.RATE_LIMIT);
  });

  it('should return unknown for unrecognized errors', () => {
    expect(getErrorCategory(new Error('Some random error'))).toBe(ErrorCategory.UNKNOWN);
    expect(getErrorCategory('string')).toBe(ErrorCategory.UNKNOWN);
  });
});

describe('isRetryableError', () => {
  it('should return true for retryable AppError', () => {
    const error = new AppError('Test', { retryable: true });
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for non-retryable AppError', () => {
    const error = new AppError('Test', { retryable: false });
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return true for network errors', () => {
    expect(isRetryableError(new Error('Network error'))).toBe(true);
  });

  it('should return true for rate limit errors', () => {
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('should return false for unknown errors', () => {
    expect(isRetryableError(new Error('Unknown error'))).toBe(false);
  });
});

describe('getErrorAction', () => {
  it('should suggest retry for network errors', () => {
    const error = AppError.network();
    expect(getErrorAction(error).action).toBe('retry');
  });

  it('should suggest login for auth errors', () => {
    const error = AppError.auth();
    expect(getErrorAction(error).action).toBe('login');
  });

  it('should suggest dismiss for validation errors', () => {
    const error = AppError.validation('Invalid');
    expect(getErrorAction(error).action).toBe('dismiss');
  });

  it('should suggest contact for unknown errors', () => {
    const error = new Error('Unknown');
    expect(getErrorAction(error).action).toBe('contact');
  });
});

describe('formatErrorForLog', () => {
  it('should format AppError with all properties', () => {
    const error = new AppError('Test', {
      category: ErrorCategory.SERVER,
      code: 'SERVER_ERROR',
      statusCode: 500,
      retryable: true,
      details: { key: 'value' },
    });

    const formatted = formatErrorForLog(error);
    expect(formatted.name).toBe('AppError');
    expect(formatted.message).toBe('Test');
    expect(formatted.category).toBe(ErrorCategory.SERVER);
    expect(formatted.code).toBe('SERVER_ERROR');
    expect(formatted.statusCode).toBe(500);
    expect(formatted.retryable).toBe(true);
  });

  it('should format regular Error', () => {
    const error = new Error('Test error');
    const formatted = formatErrorForLog(error);
    expect(formatted.name).toBe('Error');
    expect(formatted.message).toBe('Test error');
    expect(formatted.stack).toBeDefined();
  });

  it('should format non-Error values', () => {
    const formatted = formatErrorForLog('string error');
    expect(formatted.value).toBe('string error');
    expect(formatted.type).toBe('string');
  });
});
