import { describe, expect, it } from 'vitest';
import {
  assertDurableAgentEngineLimits,
  DURABLE_AGENT_PROFILES,
  isValidCustomAgentProfile,
  isValidDurableAgentProfile,
  type DurableAgentProfile,
} from './durableAgentProfiles';

function profile(overrides: Partial<DurableAgentProfile> = {}): DurableAgentProfile {
  return {
    ...DURABLE_AGENT_PROFILES[0],
    id: 'custom-reviewer',
    allowedExecutables: ['rg', 'jq'],
    ...overrides,
  };
}

describe('durable agent profiles', () => {
  it('keeps every managed agent inside engine admission bounds', () => {
    const ids = DURABLE_AGENT_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const profile of DURABLE_AGENT_PROFILES) {
      expect(() => assertDurableAgentEngineLimits(profile)).not.toThrow();
      expect(profile.maxIterations).toBeGreaterThanOrEqual(1);
      expect(profile.maxIterations).toBeLessThanOrEqual(50);
      expect(profile.maxTokens).toBeGreaterThanOrEqual(128);
      expect(profile.maxTokens).toBeLessThanOrEqual(4096);
      expect(profile.maxTotalTokens).toBeGreaterThanOrEqual(profile.maxTokens);
      expect(profile.maxTotalTokens).toBeLessThanOrEqual(200_000);
      expect(profile.allowedExecutables.length).toBeGreaterThan(0);
      expect(profile.allowedExecutables).not.toEqual(
        expect.arrayContaining(['sh', 'bash', 'zsh', 'env'])
      );
      expect(profile.allowedExecutables.every((executable) => !executable.includes('/'))).toBe(
        true
      );
    }
  });

  it('validates custom profiles against the safe tool catalogue', () => {
    const profile = {
      id: 'custom-reviewer',
      name: 'Reviewer',
      description: 'Reviews output',
      provider: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'Review the output carefully.',
      maxIterations: 10,
      allowedExecutables: ['rg', 'jq'],
      maxTokens: 1024,
      maxTotalTokens: 20_000,
    };
    expect(isValidCustomAgentProfile(profile)).toBe(true);
    expect(isValidCustomAgentProfile({ ...profile, allowedExecutables: ['bash'] })).toBe(false);
    expect(isValidCustomAgentProfile({ ...profile, maxIterations: 51 })).toBe(false);
  });
});

describe('engine-bound durable agent limits', () => {
  it('accepts exactly 12000 prompt bytes and reports a multibyte overflow', () => {
    expect(() =>
      assertDurableAgentEngineLimits(profile({ systemPrompt: '界'.repeat(4000) }))
    ).not.toThrow();
    expect(() =>
      assertDurableAgentEngineLimits(profile({ systemPrompt: '界'.repeat(4000) + 'é' }))
    ).toThrow('Agent system prompt uses 12002 UTF-8 bytes; the limit is 12000.');
  });

  it('accepts exactly 128 model bytes and reports a multibyte overflow', () => {
    expect(() =>
      assertDurableAgentEngineLimits(profile({ model: '模'.repeat(42) + 'ab' }))
    ).not.toThrow();
    expect(() => assertDurableAgentEngineLimits(profile({ model: '模'.repeat(43) }))).toThrow(
      'Agent model uses 129 UTF-8 bytes; the limit is 128.'
    );
  });

  it('accepts exactly 128 connector bytes and reports a multibyte overflow', () => {
    expect(() =>
      assertDurableAgentEngineLimits(profile({ connectorKey: '鍵'.repeat(42) + 'ab' }))
    ).not.toThrow();
    expect(() =>
      assertDurableAgentEngineLimits(profile({ connectorKey: '鍵'.repeat(43) }))
    ).toThrow('Agent connector key uses 129 UTF-8 bytes; the limit is 128.');
  });

  it.each([
    ['systemPrompt', 'Agent system prompt', '界'.repeat(4000), 12002, 12000],
    ['model', 'Agent model', '模'.repeat(42) + 'ab', 130, 128],
    ['connectorKey', 'Agent connector key', '鍵'.repeat(42) + 'ab', 130, 128],
  ] as const)(
    'counts surrounding whitespace in the raw %s byte limit',
    (field, label, value, actual, limit) => {
      expect(() => assertDurableAgentEngineLimits(profile({ [field]: ` ${value} ` }))).toThrow(
        `${label} uses ${actual} UTF-8 bytes; the limit is ${limit}.`
      );
    }
  );

  it.each([
    ['model', 'Agent model'],
    ['connectorKey', 'Agent connector key'],
  ] as const)('rejects whitespace-only %s with an actionable field error', (field, label) => {
    expect(() => assertDurableAgentEngineLimits(profile({ [field]: ' \t ' }))).toThrow(
      `${label} uses 3 UTF-8 bytes but is blank.`
    );
  });

  it('allows an omitted connector key and preserves all valid input values', () => {
    const submitted = profile({
      model: ' gpt-5.4 ',
      connectorKey: ' openai-primary ',
      systemPrompt: '  Follow the operator instructions.  ',
    });
    const original = structuredClone(submitted);
    expect(() => assertDurableAgentEngineLimits(submitted)).not.toThrow();
    expect(submitted).toEqual(original);
    expect(() =>
      assertDurableAgentEngineLimits(profile({ connectorKey: undefined }))
    ).not.toThrow();
  });

  it('does not apply engine byte limits to local profile names or descriptions', () => {
    expect(() =>
      assertDurableAgentEngineLimits(
        profile({
          name: '界'.repeat(80),
          description: '界'.repeat(240),
        })
      )
    ).not.toThrow();
  });

  it.each([
    { systemPrompt: '界'.repeat(4001) },
    { model: '模'.repeat(43) },
    { connectorKey: '鍵'.repeat(43) },
  ])('keeps previously valid multibyte profiles readable despite engine overflow', (overrides) => {
    const saved = profile(overrides);
    expect(isValidDurableAgentProfile(saved)).toBe(true);
    expect(isValidCustomAgentProfile(saved)).toBe(true);
    expect(() => assertDurableAgentEngineLimits(saved)).toThrow('UTF-8 bytes');
  });
});
