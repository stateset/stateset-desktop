import { describe, expect, it } from 'vitest';
import { acceptanceCriteriaSchema, parseStartConfiguration } from './configuration';
import { DEFAULT_CHAT_CONFIGURATION } from './durableTypes';

const criterion = (path: string, expected: unknown = true) => ({
  path,
  kind: 'json' as const,
  expected,
});

describe('engine-bound chat settings', () => {
  it('allows eight checks across four files without altering the expected values', () => {
    const criteria = Array.from({ length: 8 }, (_, index) =>
      criterion(`/workspace/${index % 4}.json`, { report: ['ready', index] })
    );
    expect(parseStartConfiguration({ ...DEFAULT_CHAT_CONFIGURATION, criteria }).criteria).toEqual(
      criteria
    );
  });
  it.each([
    ['ASCII', 'a'.repeat(16382), 'a'],
    ['multibyte', '🙂'.repeat(4095) + 'aa', '🙂'],
    ['JSON escaping', '\u0001'.repeat(2730) + 'aa', '\u0001'],
  ])('measures the serialized %s expected value at the 16 KiB boundary', (_label, value, next) => {
    expect(new TextEncoder().encode(JSON.stringify(value))).toHaveLength(16384);
    expect(
      acceptanceCriteriaSchema.safeParse([criterion('/workspace/result.json', value)]).success
    ).toBe(true);
    expect(
      acceptanceCriteriaSchema.safeParse([criterion('/workspace/result.json', value + next)])
        .success
    ).toBe(false);
  });
  it('measures paths and model names in UTF-8 bytes', () => {
    const path = `/workspace/${'漢'.repeat(337)}aa`;
    expect(new TextEncoder().encode(path)).toHaveLength(1024);
    expect(acceptanceCriteriaSchema.safeParse([criterion(path)]).success).toBe(true);
    expect(acceptanceCriteriaSchema.safeParse([criterion(path + '漢')]).success).toBe(false);
    expect(
      parseStartConfiguration({ ...DEFAULT_CHAT_CONFIGURATION, model: '漢'.repeat(85) }).model
    ).toBe('漢'.repeat(85));
    expect(() =>
      parseStartConfiguration({ ...DEFAULT_CHAT_CONFIGURATION, model: '漢'.repeat(85) + 'a' })
    ).toThrow('255 UTF-8 bytes');
  });
  it.each([
    '/workspace',
    '/workspace/',
    '/workspace/../secret.txt',
    '/workspace/./report.txt',
    '/workspace/a\\b.txt',
    '/workspace/a\u007f.txt',
    '/workspace/a\u009f.txt',
    '/workspace-other/report.txt',
  ])('rejects the invalid acceptance path %j', (path) => {
    expect(acceptanceCriteriaSchema.safeParse([criterion(path)]).success).toBe(false);
  });
  it('rejects expected values that cannot be sent as JSON', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [undefined, 1n, cyclic])
      expect(
        acceptanceCriteriaSchema.safeParse([
          { ...criterion('/workspace/report.json'), expected: value },
        ]).success
      ).toBe(false);
  });
  it('allows supported executable and connector identifiers at the boundary', () => {
    const name = 'a'.repeat(100);
    const configuration = {
      ...DEFAULT_CHAT_CONFIGURATION,
      permissions: {
        ...DEFAULT_CHAT_CONFIGURATION.permissions,
        allowed_executables: ['python3', 'my-tool_v1.2', name],
      },
      mcp_servers: [name],
    };
    expect(parseStartConfiguration(configuration)).toEqual(configuration);
    expect(() => parseStartConfiguration({ ...configuration, mcp_servers: [name + 'a'] })).toThrow(
      '1–100'
    );
  });
});
