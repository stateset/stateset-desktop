import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  buildJsonPreview,
  stringifyToolPayload,
  formatToolCallId,
  TOOL_PAYLOAD_PREVIEW_OPTIONS,
} from './utils';

// ── formatDuration ──────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(130)).toBe('2m 10s');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s');
  });

  it('shows 0m between hours and seconds', () => {
    expect(formatDuration(3601)).toBe('1h 0m 1s');
  });

  it('returns 0s for zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('returns 0s for negative values', () => {
    expect(formatDuration(-10)).toBe('0s');
  });

  it('returns 0s for NaN', () => {
    expect(formatDuration(NaN)).toBe('0s');
  });

  it('returns 0s for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('0s');
  });
});

// ── buildJsonPreview ────────────────────────────────────────────────────

describe('buildJsonPreview', () => {
  const opts = { ...TOOL_PAYLOAD_PREVIEW_OPTIONS, maxNodes: 100 };

  it('passes through simple values', () => {
    expect(buildJsonPreview(42, opts).value).toBe(42);
    expect(buildJsonPreview(true, opts).value).toBe(true);
    expect(buildJsonPreview(null, opts).value).toBe(null);
    expect(buildJsonPreview('hi', opts).value).toBe('hi');
  });

  it('truncates long strings', () => {
    const longStr = 'a'.repeat(10_000);
    const result = buildJsonPreview(longStr, { ...opts, maxStringLength: 100 });
    expect(result.truncated).toBe(true);
    expect((result.value as string).length).toBeLessThan(longStr.length);
  });

  it('handles arrays', () => {
    const result = buildJsonPreview([1, 2, 3], opts);
    expect(result.value).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(false);
  });

  it('truncates long arrays', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const result = buildJsonPreview(arr, { ...opts, maxArrayLength: 5 });
    expect(result.truncated).toBe(true);
    const val = result.value as unknown[];
    expect(val.length).toBe(6); // 5 items + truncation message
    expect(val[5]).toMatch(/more items/);
  });

  it('truncates deeply nested objects', () => {
    let obj: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 10; i++) {
      obj = { nested: obj };
    }
    const result = buildJsonPreview(obj, { ...opts, maxDepth: 3 });
    expect(result.truncated).toBe(true);
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = buildJsonPreview(obj, opts);
    expect(result.truncated).toBe(true);
    expect((result.value as Record<string, unknown>).self).toBe('[Circular]');
  });

  it('converts undefined to string', () => {
    expect(buildJsonPreview(undefined, opts).value).toBe('[undefined]');
  });

  it('converts dates to ISO strings', () => {
    const date = new Date('2026-01-15T10:30:00Z');
    expect(buildJsonPreview(date, opts).value).toBe('2026-01-15T10:30:00.000Z');
  });

  it('truncates objects with many keys', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 100; i++) obj[`key${i}`] = i;
    const result = buildJsonPreview(obj, { ...opts, maxKeys: 5 });
    expect(result.truncated).toBe(true);
  });
});

// ── stringifyToolPayload ────────────────────────────────────────────────

describe('stringifyToolPayload', () => {
  it('returns strings directly', () => {
    expect(stringifyToolPayload('hello', false)).toBe('hello');
  });

  it('converts numbers', () => {
    expect(stringifyToolPayload(42, false)).toBe('42');
  });

  it('converts booleans', () => {
    expect(stringifyToolPayload(true, false)).toBe('true');
  });

  it('converts null', () => {
    expect(stringifyToolPayload(null, false)).toBe('null');
  });

  it('converts undefined', () => {
    expect(stringifyToolPayload(undefined, false)).toBe('undefined');
  });

  it('stringifies objects as JSON', () => {
    const obj = { key: 'value' };
    expect(stringifyToolPayload(obj, false)).toBe('{"key":"value"}');
  });

  it('pretty-prints when requested', () => {
    const obj = { key: 'value' };
    const result = stringifyToolPayload(obj, true);
    expect(result).toContain('\n');
    expect(result).toContain('  "key"');
  });

  it('handles circular refs in objects', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = stringifyToolPayload(obj, false);
    expect(result).toContain('[Circular]');
  });
});

// ── formatToolCallId ────────────────────────────────────────────────────

describe('formatToolCallId', () => {
  it('returns em dash for empty string', () => {
    expect(formatToolCallId('')).toBe('—');
  });

  it('returns short IDs unchanged', () => {
    expect(formatToolCallId('abc123')).toBe('abc123');
  });

  it('truncates long IDs', () => {
    const longId = 'call_1234567890abcdef';
    const result = formatToolCallId(longId);
    expect(result).toBe('call_1...cdef');
    expect(result.length).toBeLessThan(longId.length);
  });

  it('keeps IDs at boundary length', () => {
    const id = '12345678901234'; // exactly 14 chars
    expect(formatToolCallId(id)).toBe(id);
  });
});
