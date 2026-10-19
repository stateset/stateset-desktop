import { describe, expect, it } from 'vitest';
import { setupReportSchema } from './durableTypes';

// These are the version-one capability checks emitted by engine-api.
const capabilities = [
  'sandbox',
  'nsr',
  'durable_sessions',
  'inference_ready',
  'computer_use',
  'workspace_evidence',
  'organization_binding',
];
const report = () => ({
  version: 1,
  ready: true,
  checks: capabilities.map((key) => ({ key, status: 'pass', message: `${key} configured` })),
  mcp_servers: [],
});

describe('computer service readiness evidence', () => {
  it('accepts the complete engine capability report', () => {
    expect(setupReportSchema.safeParse(report()).success).toBe(true);
  });

  it.each(capabilities)('refuses readiness without %s evidence', (missing) => {
    const value = report();
    value.checks = value.checks.filter((check) => check.key !== missing);
    expect(setupReportSchema.safeParse(value).success).toBe(false);
  });

  it('does not treat a generic passing engine check as sandbox readiness', () => {
    const value = report();
    value.checks = [{ key: 'engine', status: 'pass', message: 'HTTP connected' }];
    expect(setupReportSchema.safeParse(value).success).toBe(false);
  });

  it('rejects duplicated checks even when every entry passes', () => {
    const value = report();
    value.checks.push(value.checks[0]);
    expect(setupReportSchema.safeParse(value).success).toBe(false);
  });

  it('rejects ambiguous tool readiness', () => {
    expect(
      setupReportSchema.safeParse({
        ...report(),
        mcp_servers: [
          { key: 'reports', ready: true },
          { key: 'reports', ready: false },
        ],
      }).success
    ).toBe(false);
  });

  it('preserves partial failed reports so setup can explain missing services', () => {
    expect(
      setupReportSchema.safeParse({
        ...report(),
        ready: false,
        checks: [{ key: 'sandbox', status: 'fail', message: 'Controller unavailable' }],
      }).success
    ).toBe(true);
  });

  it('accepts additional successful checks for newer engines', () => {
    const value = report();
    value.checks.push({ key: 'worker', status: 'pass', message: 'Worker available' });
    expect(setupReportSchema.safeParse(value).success).toBe(true);
  });

  it('rejects readiness when an additional engine check failed', () => {
    const value = report();
    value.checks.push({ key: 'worker', status: 'fail', message: 'No worker' });
    expect(setupReportSchema.safeParse(value).success).toBe(false);
  });
});
