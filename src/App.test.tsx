import { describe, expect, it } from 'vitest';
import { shouldUseHashRouting } from './lib/routing';

describe('shouldUseHashRouting', () => {
  it('uses hash routing for packaged Electron file URLs', () => {
    expect(shouldUseHashRouting(true, 'file:')).toBe(true);
  });

  it('uses browser routing for Electron dev URLs', () => {
    expect(shouldUseHashRouting(true, 'http:')).toBe(false);
  });

  it('uses browser routing outside Electron', () => {
    expect(shouldUseHashRouting(false, 'file:')).toBe(false);
  });
});
