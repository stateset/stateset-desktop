import { describe, it, expect } from 'vitest';
import { PLATFORMS } from './platforms';

const VALID_FIELD_TYPES = new Set(['text', 'password', 'email']);

describe('PLATFORMS', () => {
  it('contains the six built-in platforms', () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual([
      'shopify',
      'gorgias',
      'zendesk',
      'recharge',
      'klaviyo',
      'shipstation',
    ]);
  });

  it('has unique platform ids', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defines name, description, icon and color for every platform', () => {
    for (const platform of PLATFORMS) {
      expect(platform.name.length).toBeGreaterThan(0);
      expect(platform.description.length).toBeGreaterThan(0);
      expect(platform.icon.length).toBeGreaterThan(0);
      expect(platform.color).toMatch(/^bg-/);
    }
  });

  it('declares at least one required field with valid types per platform', () => {
    for (const platform of PLATFORMS) {
      expect(platform.requiredFields.length).toBeGreaterThan(0);
      for (const field of platform.requiredFields) {
        expect(field.key.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
        expect(VALID_FIELD_TYPES.has(field.type)).toBe(true);
      }
    }
  });

  it('uses unique required field keys within each platform', () => {
    for (const platform of PLATFORMS) {
      const keys = platform.requiredFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('masks secret fields with the password type', () => {
    for (const platform of PLATFORMS) {
      for (const field of platform.requiredFields) {
        if (/token|key|secret/i.test(field.key)) {
          expect(field.type).toBe('password');
        }
      }
    }
  });

  it('configures OAuth for shopify, gorgias and zendesk only', () => {
    const oauthIds = PLATFORMS.filter((p) => p.oauth).map((p) => p.id);
    expect(oauthIds).toEqual(['shopify', 'gorgias', 'zendesk']);
  });

  it('matches the oauth provider to the platform id', () => {
    for (const platform of PLATFORMS) {
      if (platform.oauth) {
        expect(platform.oauth.provider).toBe(platform.id);
        expect(platform.oauth.label.length).toBeGreaterThan(0);
        expect(platform.oauth.fields.length).toBeGreaterThan(0);
      }
    }
  });

  it('only uses oauth field keys that exist in requiredFields', () => {
    for (const platform of PLATFORMS) {
      if (!platform.oauth) continue;
      const requiredKeys = new Set(platform.requiredFields.map((f) => f.key));
      for (const field of platform.oauth.fields) {
        expect(requiredKeys.has(field.key)).toBe(true);
      }
    }
  });
});
