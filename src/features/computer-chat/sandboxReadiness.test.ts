import { expect, it } from 'vitest';
import { sandboxCapabilitiesSchema, sandboxReadiness } from './sandboxReadiness';

const capabilities = {
  version: 1,
  organization_id: 'org',
  computer_use: true,
  inference_ready: true,
  workspace_evidence: true,
  max_artifact_bytes: 131072,
};
it('accepts a complete version-one controller report and requires every desktop capability', () => {
  expect(sandboxReadiness(sandboxCapabilitiesSchema.parse(capabilities)).ready).toBe(true);
  for (const key of ['computer_use', 'inference_ready', 'workspace_evidence']) {
    expect(
      sandboxReadiness(sandboxCapabilitiesSchema.parse({ ...capabilities, [key]: false })).ready
    ).toBe(false);
  }
  expect(
    sandboxReadiness(
      sandboxCapabilitiesSchema.parse({ ...capabilities, max_artifact_bytes: 65536 })
    ).ready
  ).toBe(false);
});
it.each([
  'version',
  'organization_id',
  'computer_use',
  'inference_ready',
  'workspace_evidence',
  'max_artifact_bytes',
])('rejects reports missing %s', (key) => {
  const partial: Record<string, unknown> = { ...capabilities };
  delete partial[key];
  expect(sandboxCapabilitiesSchema.safeParse(partial).success).toBe(false);
});
it.each([
  { version: 2 },
  { organization_id: '' },
  { inference_ready: 'true' },
  { max_artifact_bytes: -1 },
  { max_artifact_bytes: Infinity },
  { max_artifact_bytes: 1.5 },
])('rejects malformed evidence %j', (changes) => {
  expect(sandboxCapabilitiesSchema.safeParse({ ...capabilities, ...changes }).success).toBe(false);
});
