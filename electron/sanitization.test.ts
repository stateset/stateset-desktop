import { describe, it, expect } from 'vitest';
import {
  sanitizeSensitiveText,
  sanitizeValue,
  sanitizeStringRecord,
  sanitizeQueryParams,
} from './sanitization';

describe('sanitizeSensitiveText', () => {
  it('redacts API keys, tokens, and emails', () => {
    const input =
      'api_key=sk-abcdefghijklmnopqrstuvwxyz12 email=test@example.com bearer abc.def.ghi';
    const output = sanitizeSensitiveText(input);

    expect(output).toContain('[REDACTED_EMAIL]');
    expect(output).toContain('[REDACTED_TOKEN]');
    expect(output).not.toContain('test@example.com');
  });

  it('redacts AWS-style keys', () => {
    const output = sanitizeSensitiveText('key AKIA1234567890ABCDEF leaked');
    expect(output).toContain('[REDACTED_AWS_KEY]');
  });

  it('fully redacts bearer authorization values with opaque tokens', () => {
    const input = 'Authorization: Bearer opaque-token-1234567890';
    const output = sanitizeSensitiveText(input);

    expect(output).toContain('[REDACTED_TOKEN]');
    expect(output).not.toContain('opaque-token-1234567890');
  });
});

describe('sanitizeValue', () => {
  it('recursively sanitizes nested arrays and objects', () => {
    const input = {
      message: 'contact me at jane@example.com',
      nested: {
        token: 'AuthorizationBearerVerySecretToken',
      },
      list: ['safe', 'sk-abcdefghijklmnopqrstuvwxyz12'],
    };

    const output = sanitizeValue(input) as {
      message: string;
      nested: { token: string };
      list: string[];
    };

    expect(output.message).toContain('[REDACTED_EMAIL]');
    expect(output.nested.token).toContain('[REDACTED_TOKEN]');
    expect(output.list[1]).toContain('[REDACTED_API_KEY]');
  });

  it('returns primitives unchanged when not strings', () => {
    expect(sanitizeValue(42)).toBe(42);
    expect(sanitizeValue(null)).toBeNull();
    expect(sanitizeValue(true)).toBe(true);
  });
});

describe('sanitizeStringRecord', () => {
  it('returns an empty object for non-record inputs', () => {
    expect(sanitizeStringRecord(null)).toEqual({});
    expect(sanitizeStringRecord('nope')).toEqual({});
  });

  it('stringifies non-string values while sanitizing sensitive strings', () => {
    const output = sanitizeStringRecord({
      count: 2,
      user: 'alice@example.com',
    });

    expect(output).toEqual({
      count: '2',
      user: '[REDACTED_EMAIL]',
    });
  });

  it('redacts bearer tokens stored in header-style records', () => {
    const output = sanitizeStringRecord({
      authorization: 'Bearer opaque-token-1234567890',
    });

    expect(output.authorization).toContain('[REDACTED_TOKEN]');
    expect(output.authorization).not.toContain('opaque-token-1234567890');
  });
});

describe('sanitizeQueryParams', () => {
  it('sanitizes string query input', () => {
    const output = sanitizeQueryParams('token=sk-abcdefghijklmnopqrstuvwxyz12');
    expect(output).toContain('[REDACTED_API_KEY]');
  });

  it('normalizes and sanitizes object query input', () => {
    const output = sanitizeQueryParams({
      email: 'query@example.com',
      page: 3,
    });
    expect(output).toContain('email=%5BREDACTED_EMAIL%5D');
    expect(output).toContain('page=3');
  });
});
