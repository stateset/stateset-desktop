import { z } from 'zod';

// Controller contract: GET /api/v1/agent/sessions/capabilities, version 1.
export const sandboxCapabilitiesSchema = z.object({
  version: z.literal(1),
  organization_id: z.string().min(1),
  computer_use: z.boolean(),
  inference_ready: z.boolean(),
  workspace_evidence: z.boolean(),
  max_artifact_bytes: z.number().int().nonnegative().safe(),
});
export type SandboxCapabilities = z.infer<typeof sandboxCapabilitiesSchema>;

export function sandboxReadiness(capabilities: SandboxCapabilities) {
  const checks = [
    {
      label: 'Computer image',
      ready: capabilities.computer_use,
      issue: 'The computer-use image is unavailable.',
    },
    {
      label: 'Model configuration',
      ready: capabilities.inference_ready,
      issue: 'Ask your Sandbox organization administrator to configure model access.',
    },
    {
      label: 'File evidence',
      ready: capabilities.workspace_evidence && capabilities.max_artifact_bytes >= 131072,
      issue: 'The controller must support workspace evidence for files up to 128 KiB.',
    },
  ];
  return { ready: checks.every((check) => check.ready), checks };
}
