import { describe, expect, it } from 'vitest';
import { sameSetupContext, type SetupContext } from './setup';
const context: SetupContext = {
  tenantId: 'tenant',
  brandId: 'brand',
  engineUrl: 'https://engine.example',
  apiKey: 'key',
  mcpServers: ['reports', 'inventory'],
};
describe('setup check identity', () => {
  it.each([
    { tenantId: 'other' },
    { brandId: 'other' },
    { engineUrl: 'https://other.example' },
    { apiKey: 'rotated' },
    { mcpServers: ['reports'] },
  ])('invalidates readiness for a changed setting %j', (patch) =>
    expect(sameSetupContext(context, { ...context, ...patch })).toBe(false)
  );
  it('accepts reordered tool selection but keeps duplicate counts distinct', () => {
    expect(sameSetupContext(context, { ...context, mcpServers: ['inventory', 'reports'] })).toBe(
      true
    );
    expect(sameSetupContext(context, { ...context, mcpServers: ['reports', 'reports'] })).toBe(
      false
    );
  });
});
