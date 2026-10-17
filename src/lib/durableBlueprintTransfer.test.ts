import { describe, expect, it } from 'vitest';
import { parseBlueprintBundle, serializeBlueprints } from './durableBlueprintTransfer';
import type { DurableWorkflowBlueprint } from '../stores/durableWorkflows';

function blueprint(): DurableWorkflowBlueprint {
  return {
    id: 'blueprint-source',
    name: 'Weekly review',
    goal: 'Review the weekly export',
    definition: {
      steps: [['collect-data'], ['verify-report']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
      stepAgents: [null, null],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('durable blueprint transfer', () => {
  it('round-trips a versioned bundle and assigns collision-safe local ids', () => {
    const imported = parseBlueprintBundle(serializeBlueprints([blueprint()]), () => 'new-id');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      id: 'blueprint-new-id',
      name: 'Weekly review',
      definition: { steps: [['collect-data'], ['verify-report']] },
    });
  });

  it('rejects unsupported, malformed, and credential-bearing bundles', () => {
    expect(() => parseBlueprintBundle('{nope')).toThrow('valid JSON');
    expect(() => parseBlueprintBundle(JSON.stringify({ format: 'other', version: 1 }))).toThrow(
      'Unsupported'
    );
    const unsafe = blueprint();
    unsafe.definition.steps = [['API_KEY=plaintext run-task']];
    unsafe.definition.stepAgents = [null];
    expect(() => parseBlueprintBundle(serializeBlueprints([unsafe]))).toThrow('Inline credentials');
  });
});
