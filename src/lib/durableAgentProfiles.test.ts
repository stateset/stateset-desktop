import { describe, expect, it } from 'vitest';
import { DURABLE_AGENT_PROFILES, isValidCustomAgentProfile } from './durableAgentProfiles';

describe('durable agent profiles', () => {
  it('keeps every managed agent inside engine admission bounds', () => {
    const ids = DURABLE_AGENT_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const profile of DURABLE_AGENT_PROFILES) {
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
