import type { AgentSessionConfig } from '../types';

export const DEFAULT_AGENT_CONFIG: AgentSessionConfig = {
  loop_interval_ms: 1000,
  max_iterations: 100,
  iteration_timeout_secs: 300,
  pause_on_error: false,
  custom_instructions: '',
  mcp_servers: [],
  model: 'claude-sonnet-4-6',
  temperature: 0.7,
};

const MIN_LOOP_INTERVAL_MS = 100;
const MIN_ITERATIONS = 1;
const MIN_ITERATION_TIMEOUT_SECS = 1;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeAgentConfig(
  config: Partial<AgentSessionConfig>,
  base?: AgentSessionConfig
): AgentSessionConfig {
  const merged = { ...DEFAULT_AGENT_CONFIG, ...base, ...config };

  const loopInterval = Math.max(
    MIN_LOOP_INTERVAL_MS,
    Math.floor(toNumber(merged.loop_interval_ms, DEFAULT_AGENT_CONFIG.loop_interval_ms))
  );
  const maxIterations = Math.max(
    MIN_ITERATIONS,
    Math.floor(toNumber(merged.max_iterations, DEFAULT_AGENT_CONFIG.max_iterations))
  );
  const iterationTimeout = Math.max(
    MIN_ITERATION_TIMEOUT_SECS,
    Math.floor(toNumber(merged.iteration_timeout_secs, DEFAULT_AGENT_CONFIG.iteration_timeout_secs))
  );
  const temperature = clamp(
    toNumber(merged.temperature, DEFAULT_AGENT_CONFIG.temperature),
    MIN_TEMPERATURE,
    MAX_TEMPERATURE
  );
  const mcpServers = Array.isArray(merged.mcp_servers)
    ? merged.mcp_servers.map((server) => String(server).trim()).filter(Boolean)
    : [];
  const model =
    typeof merged.model === 'string' && merged.model.trim()
      ? merged.model.trim()
      : DEFAULT_AGENT_CONFIG.model;
  const customInstructions =
    typeof merged.custom_instructions === 'string' ? merged.custom_instructions.trim() : '';
  const pauseOnError = Boolean(merged.pause_on_error);
  const sandboxApiKey =
    merged.sandbox_api_key === null || merged.sandbox_api_key === undefined
      ? undefined
      : String(merged.sandbox_api_key);

  return {
    loop_interval_ms: loopInterval,
    max_iterations: maxIterations,
    iteration_timeout_secs: iterationTimeout,
    pause_on_error: pauseOnError,
    custom_instructions: customInstructions,
    mcp_servers: mcpServers,
    model,
    temperature,
    sandbox_api_key: sandboxApiKey,
  };
}
