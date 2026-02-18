import type { AgentSessionConfig } from '../types';

export interface ImportResult {
  config: Partial<AgentSessionConfig>;
  warnings: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const KNOWN_KEYS: Set<string> = new Set([
  'agent_type',
  'loop_interval_ms',
  'max_iterations',
  'iteration_timeout_secs',
  'pause_on_error',
  'custom_instructions',
  'mcp_servers',
  'model',
  'temperature',
]);

/**
 * Validate that a parsed object matches the AgentSessionConfig shape.
 * Unknown keys produce warnings (returned separately), not errors.
 */
export function validateAgentConfig(config: unknown): ValidationResult & { warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['Config must be a non-null object'], warnings };
  }

  const obj = config as Record<string, unknown>;

  // Flag unknown keys as warnings
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown key "${key}" will be ignored`);
    }
  }

  // agent_type (optional string)
  if ('agent_type' in obj && obj.agent_type !== undefined) {
    if (typeof obj.agent_type !== 'string') {
      errors.push('agent_type must be a string');
    }
  }

  // loop_interval_ms (number, >= 100)
  if ('loop_interval_ms' in obj && obj.loop_interval_ms !== undefined) {
    if (typeof obj.loop_interval_ms !== 'number' || !Number.isFinite(obj.loop_interval_ms)) {
      errors.push('loop_interval_ms must be a finite number');
    } else if (obj.loop_interval_ms < 100) {
      errors.push('loop_interval_ms must be >= 100');
    }
  }

  // max_iterations (number, positive integer)
  if ('max_iterations' in obj && obj.max_iterations !== undefined) {
    if (typeof obj.max_iterations !== 'number' || !Number.isFinite(obj.max_iterations)) {
      errors.push('max_iterations must be a finite number');
    } else if (!Number.isInteger(obj.max_iterations) || obj.max_iterations < 1) {
      errors.push('max_iterations must be a positive integer');
    }
  }

  // iteration_timeout_secs (number, positive)
  if ('iteration_timeout_secs' in obj && obj.iteration_timeout_secs !== undefined) {
    if (
      typeof obj.iteration_timeout_secs !== 'number' ||
      !Number.isFinite(obj.iteration_timeout_secs)
    ) {
      errors.push('iteration_timeout_secs must be a finite number');
    } else if (obj.iteration_timeout_secs <= 0) {
      errors.push('iteration_timeout_secs must be > 0');
    }
  }

  // pause_on_error (boolean)
  if ('pause_on_error' in obj && obj.pause_on_error !== undefined) {
    if (typeof obj.pause_on_error !== 'boolean') {
      errors.push('pause_on_error must be a boolean');
    }
  }

  // custom_instructions (optional string)
  if ('custom_instructions' in obj && obj.custom_instructions !== undefined) {
    if (typeof obj.custom_instructions !== 'string') {
      errors.push('custom_instructions must be a string');
    }
  }

  // mcp_servers (string[])
  if ('mcp_servers' in obj && obj.mcp_servers !== undefined) {
    if (!Array.isArray(obj.mcp_servers)) {
      errors.push('mcp_servers must be an array');
    } else if (!obj.mcp_servers.every((item: unknown) => typeof item === 'string')) {
      errors.push('mcp_servers must be an array of strings');
    }
  }

  // model (string)
  if ('model' in obj && obj.model !== undefined) {
    if (typeof obj.model !== 'string') {
      errors.push('model must be a string');
    } else if (obj.model.trim().length === 0) {
      errors.push('model must not be empty');
    }
  }

  // temperature (number, 0-2)
  if ('temperature' in obj && obj.temperature !== undefined) {
    if (typeof obj.temperature !== 'number' || !Number.isFinite(obj.temperature)) {
      errors.push('temperature must be a finite number');
    } else if (obj.temperature < 0 || obj.temperature > 2) {
      errors.push('temperature must be between 0 and 2');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Extract only the known AgentSessionConfig fields from a raw object.
 */
function pickKnownFields(obj: Record<string, unknown>): Partial<AgentSessionConfig> {
  const config: Partial<AgentSessionConfig> = {};

  if (typeof obj.agent_type === 'string') config.agent_type = obj.agent_type;
  if (typeof obj.loop_interval_ms === 'number') config.loop_interval_ms = obj.loop_interval_ms;
  if (typeof obj.max_iterations === 'number') config.max_iterations = obj.max_iterations;
  if (typeof obj.iteration_timeout_secs === 'number')
    config.iteration_timeout_secs = obj.iteration_timeout_secs;
  if (typeof obj.pause_on_error === 'boolean') config.pause_on_error = obj.pause_on_error;
  if (typeof obj.custom_instructions === 'string')
    config.custom_instructions = obj.custom_instructions;
  if (Array.isArray(obj.mcp_servers)) config.mcp_servers = obj.mcp_servers as string[];
  if (typeof obj.model === 'string') config.model = obj.model;
  if (typeof obj.temperature === 'number') config.temperature = obj.temperature;

  return config;
}

/**
 * Read and validate a JSON file containing agent configuration.
 * Returns the parsed config (known fields only) along with any warnings.
 * Throws if the file cannot be read, is not valid JSON, or fails validation.
 */
export async function importAgentConfig(file: File): Promise<ImportResult> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }

  const { valid, errors, warnings } = validateAgentConfig(parsed);

  if (!valid) {
    throw new Error(`Invalid agent config: ${errors.join('; ')}`);
  }

  const config = pickKnownFields(parsed as Record<string, unknown>);

  return { config, warnings };
}
