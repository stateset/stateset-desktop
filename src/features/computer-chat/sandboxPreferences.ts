import { z } from 'zod';
import { startConfigurationSchema } from './configuration';
import type { ComputerChat } from './types';

export const sandboxPreferencesSchema = z.object({
  model: startConfigurationSchema.shape.model,
  verify: z.boolean(),
});
export type SandboxPreferences = z.infer<typeof sandboxPreferencesSchema>;
export const DEFAULT_SANDBOX_PREFERENCES: SandboxPreferences = {
  model: 'claude-sonnet-4-6',
  verify: true,
};

export function sandboxPreferencesKey(chat: Pick<ComputerChat, 'id' | 'tenantId' | 'brandId'>) {
  return JSON.stringify([chat.tenantId, chat.brandId, chat.id]);
}

export function parseSandboxPreferences(value: unknown): SandboxPreferences {
  const parsed = sandboxPreferencesSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return parsed.data;
}
