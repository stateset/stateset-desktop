import { describe, it, expect } from 'vitest';
import { getConnectionState } from './connectionUtils';

describe('getConnectionState', () => {
  it('returns error when hasError is true', () => {
    expect(getConnectionState(true, true, true)).toBe('error');
  });

  it('returns connecting when connecting and no error', () => {
    expect(getConnectionState(false, true, false)).toBe('connecting');
  });

  it('returns connected when connected and not connecting/error', () => {
    expect(getConnectionState(true, false, false)).toBe('connected');
  });

  it('returns disconnected otherwise', () => {
    expect(getConnectionState(false, false, false)).toBe('disconnected');
  });
});
