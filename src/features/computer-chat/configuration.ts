import { z } from 'zod';
import { configurationSchema, criterionSchema } from './durableTypes';

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const startCriterionSchema = criterionSchema.extend({
  path: z
    .string()
    .refine(
      (path) =>
        path.startsWith('/workspace/') &&
        path.length > '/workspace/'.length &&
        !path.includes('\\') &&
        !Array.from(path).some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || (code >= 127 && code <= 159);
        }) &&
        path.split('/').every((part) => part !== '.' && part !== '..'),
      'Choose a file under /workspace without . or .. segments, backslashes or control characters.'
    )
    .refine((path) => bytes(path) <= 1024, 'File paths can use at most 1,024 UTF-8 bytes.'),
  expected: z.unknown().refine((value) => {
    try {
      const serialized = JSON.stringify(value);
      return serialized !== undefined && bytes(serialized) <= 16384;
    } catch {
      return false;
    }
  }, 'Use an expected value of at most 16,384 UTF-8 bytes as JSON.'),
});

export const acceptanceCriteriaSchema = z
  .array(startCriterionSchema)
  .max(8, 'Use at most eight acceptance checks.')
  .refine(
    (criteria) => new Set(criteria.map((criterion) => criterion.path)).size <= 4,
    'Use at most four distinct files; multiple checks can use the same file.'
  );

const identifierSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_.-]{1,100}$/,
    'Use names of 1–100 letters, numbers, dots, hyphens or underscores.'
  );

// Apply engine constraints to new work. Keep the persisted shape in durableTypes
// permissive so older conversations and their original settings remain readable.
export const startConfigurationSchema = configurationSchema.extend({
  model: z
    .string()
    .trim()
    .min(1, 'Enter a model name.')
    .refine((model) => bytes(model) <= 255, 'Use a model name of at most 255 UTF-8 bytes.'),
  criteria: acceptanceCriteriaSchema,
  permissions: configurationSchema.shape.permissions.extend({
    allowed_executables: z
      .array(identifierSchema)
      .max(32, 'Use at most 32 allowed command executables.'),
  }),
  mcp_servers: z.array(identifierSchema).max(4, 'Use at most four connected tools.'),
});

export function parseStartConfiguration(value: unknown) {
  const result = startConfigurationSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0].message);
  return result.data;
}
