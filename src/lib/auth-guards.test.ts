import { describe, it, expect } from 'vitest';
import { requireTenantId, requireBrandId, requireSessionId } from './auth-guards';

describe('requireTenantId', () => {
  it('returns the id when tenant has a valid id', () => {
    expect(requireTenantId({ id: 'tenant-123' })).toBe('tenant-123');
  });

  it('throws when tenant is null', () => {
    expect(() => requireTenantId(null)).toThrow('No tenant selected');
  });

  it('throws when tenant is undefined', () => {
    expect(() => requireTenantId(undefined)).toThrow('No tenant selected');
  });

  it('throws when tenant has empty string id', () => {
    expect(() => requireTenantId({ id: '' })).toThrow('No tenant selected');
  });
});

describe('requireBrandId', () => {
  it('returns the id when brand has a valid id', () => {
    expect(requireBrandId({ id: 'brand-456' })).toBe('brand-456');
  });

  it('throws when brand is null', () => {
    expect(() => requireBrandId(null)).toThrow('No brand selected');
  });

  it('throws when brand is undefined', () => {
    expect(() => requireBrandId(undefined)).toThrow('No brand selected');
  });

  it('throws when brand has empty string id', () => {
    expect(() => requireBrandId({ id: '' })).toThrow('No brand selected');
  });
});

describe('requireSessionId', () => {
  it('returns the session id when provided', () => {
    expect(requireSessionId('session-789')).toBe('session-789');
  });

  it('throws when session id is undefined', () => {
    expect(() => requireSessionId(undefined)).toThrow('No session ID provided');
  });
});
