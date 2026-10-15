import { describe, it, expect } from 'vitest';
import {
  verificationKey,
  toVerification,
  formatVerifiedAgo,
  isVerificationStale,
  parseVerificationMap,
} from './mcpVerifications';

const probeResult = {
  ok: true as const,
  serverName: 'stateset-sync',
  serverVersion: '2.1.0',
  protocolVersion: '2025-06-18',
  toolCount: 3,
  tools: ['a', 'b', 'c'],
};

describe('verificationKey', () => {
  it('scopes a verification to its brand', () => {
    expect(verificationKey('brand-1', 'stateset-sync')).toBe('brand-1:stateset-sync');
    expect(verificationKey('brand-2', 'stateset-sync')).not.toBe(
      verificationKey('brand-1', 'stateset-sync')
    );
  });
});

describe('toVerification', () => {
  it('keeps the identity and tool count, stamped with the time', () => {
    const now = Date.parse('2026-09-20T12:00:00.000Z');

    expect(toVerification(probeResult, now)).toEqual({
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      toolCount: 3,
      tools: ['a', 'b', 'c'],
      verifiedAt: '2026-09-20T12:00:00.000Z',
    });
  });

  it('keeps at most 25 tool names so the store stays small', () => {
    const many = {
      ...probeResult,
      toolCount: 80,
      tools: Array.from({ length: 80 }, (_, i) => `tool_${i}`),
    };

    const verification = toVerification(many, Date.parse('2026-09-20T12:00:00.000Z'));

    expect(verification.toolCount).toBe(80);
    expect(verification.tools).toHaveLength(25);
  });
});

describe('formatVerifiedAgo', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z');
  const ago = (ms: number) => formatVerifiedAgo(new Date(now - ms).toISOString(), now);

  it('reports recent checks as just now', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59_000)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(ago(60_000)).toBe('1m ago');
    expect(ago(45 * 60_000)).toBe('45m ago');
    expect(ago(3 * 3_600_000)).toBe('3h ago');
    expect(ago(2 * 86_400_000)).toBe('2d ago');
  });

  it('handles an unparseable timestamp', () => {
    expect(formatVerifiedAgo('not-a-date', now)).toBe('unknown');
  });
});

describe('isVerificationStale', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z');
  const at = (ms: number) => new Date(now - ms).toISOString();

  it('treats checks within a week as current', () => {
    expect(isVerificationStale(at(0), now)).toBe(false);
    expect(isVerificationStale(at(6 * 86_400_000), now)).toBe(false);
  });

  it('treats checks older than a week as stale', () => {
    expect(isVerificationStale(at(8 * 86_400_000), now)).toBe(true);
    expect(isVerificationStale(at(60 * 86_400_000), now)).toBe(true);
  });

  it('treats an unparseable timestamp as stale', () => {
    expect(isVerificationStale('not-a-date', now)).toBe(true);
  });
});

describe('parseVerificationMap', () => {
  it('keeps well-formed entries', () => {
    const entry = toVerification(probeResult, Date.parse('2026-09-20T12:00:00.000Z'));

    expect(parseVerificationMap({ 'brand-1:stateset-sync': entry })).toEqual({
      'brand-1:stateset-sync': entry,
    });
  });

  it('defaults tools to an empty list for records saved before tools were kept', () => {
    const parsed = parseVerificationMap({
      old: {
        serverName: 'a',
        serverVersion: '1',
        toolCount: 2,
        verifiedAt: '2026-09-20T12:00:00.000Z',
      },
    });

    expect(parsed.old.tools).toEqual([]);
  });

  it('keeps only string tool names', () => {
    const parsed = parseVerificationMap({
      entry: {
        serverName: 'a',
        serverVersion: '1',
        toolCount: 3,
        tools: ['good', 42, null, 'also_good'],
        verifiedAt: '2026-09-20T12:00:00.000Z',
      },
    });

    expect(parsed.entry.tools).toEqual(['good', 'also_good']);
  });

  it('drops malformed entries and non-objects', () => {
    expect(
      parseVerificationMap({
        good: {
          serverName: 'a',
          serverVersion: '1',
          toolCount: 1,
          verifiedAt: '2026-09-20T12:00:00.000Z',
        },
        missingFields: { serverName: 'b' },
        wrongType: { serverName: 'c', serverVersion: '1', toolCount: 'many', verifiedAt: 'x' },
        notAnObject: 'nope',
      })
    ).toEqual({
      good: {
        serverName: 'a',
        serverVersion: '1',
        toolCount: 1,
        tools: [],
        verifiedAt: '2026-09-20T12:00:00.000Z',
      },
    });
  });

  it('returns an empty map for junk input', () => {
    expect(parseVerificationMap(null)).toEqual({});
    expect(parseVerificationMap('nope')).toEqual({});
    expect(parseVerificationMap(undefined)).toEqual({});
  });
});
