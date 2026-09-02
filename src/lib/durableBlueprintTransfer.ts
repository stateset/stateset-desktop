import { assertNoInlineSecrets } from './workflowCommandSecurity';
import { isWorkflowBlueprint, type DurableWorkflowBlueprint } from '../stores/durableWorkflows';

const FORMAT = 'stateset-durable-blueprints';
const VERSION = 1;
const MAX_FILE_BYTES = 1_000_000;
const MAX_BLUEPRINTS = 100;

interface BlueprintBundle {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  blueprints: DurableWorkflowBlueprint[];
}

export function serializeBlueprints(blueprints: DurableWorkflowBlueprint[]): string {
  if (blueprints.length > MAX_BLUEPRINTS || !blueprints.every(isWorkflowBlueprint)) {
    throw new Error('Blueprint collection is invalid.');
  }
  for (const blueprint of blueprints) assertNoInlineSecrets(blueprint.definition.steps);
  const bundle: BlueprintBundle = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    blueprints,
  };
  return JSON.stringify(bundle, null, 2);
}

export function downloadBlueprints(blueprints: DurableWorkflowBlueprint[]): void {
  const content = serializeBlueprints(blueprints);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `stateset-workflow-blueprints-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseBlueprintBundle(
  text: string,
  createId: () => string = () => crypto.randomUUID()
): DurableWorkflowBlueprint[] {
  if (new Blob([text]).size > MAX_FILE_BYTES) throw new Error('Blueprint file exceeds 1 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Blueprint file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Blueprint bundle is invalid.');
  const bundle = parsed as Record<string, unknown>;
  if (bundle.format !== FORMAT || bundle.version !== VERSION) {
    throw new Error('Unsupported blueprint bundle format or version.');
  }
  if (!Array.isArray(bundle.blueprints) || bundle.blueprints.length > MAX_BLUEPRINTS) {
    throw new Error(`Blueprint bundle must contain no more than ${MAX_BLUEPRINTS} items.`);
  }
  if (!bundle.blueprints.every(isWorkflowBlueprint)) {
    throw new Error('Blueprint bundle contains an invalid workflow definition.');
  }
  const now = new Date().toISOString();
  return bundle.blueprints.map((blueprint) => {
    assertNoInlineSecrets(blueprint.definition.steps);
    return {
      ...blueprint,
      id: `blueprint-${createId()}`,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export async function importBlueprintFile(file: File): Promise<DurableWorkflowBlueprint[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Blueprint file exceeds 1 MB.');
  return parseBlueprintBundle(await file.text());
}
