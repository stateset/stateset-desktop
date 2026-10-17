export interface DurableAgentProfile {
  id: string;
  name: string;
  description: string;
  provider: 'openai' | 'router';
  connectorKey?: string;
  model: string;
  systemPrompt: string;
  maxIterations: number;
  allowedExecutables: string[];
  maxTokens: number;
  maxTotalTokens: number;
}

export const COMMAND_RUNNER_ID = 'command-runner';
export const DURABLE_AGENT_EXECUTABLES = [
  'rg',
  'jq',
  'cat',
  'head',
  'tail',
  'wc',
  'sort',
  'stat',
  'sha256sum',
  'python3',
] as const;

export const DURABLE_AGENT_PROFILES: DurableAgentProfile[] = [
  {
    id: 'operations',
    name: 'Operations agent',
    description: 'Investigates files, validates state, and completes bounded operational work.',
    provider: 'openai',
    connectorKey: 'openai-primary',
    model: 'gpt-5.4',
    systemPrompt:
      'You are a careful operations agent. Inspect evidence before acting, make the smallest safe change, and finish only when the task objective is verifiably complete.',
    maxIterations: 12,
    allowedExecutables: ['rg', 'jq', 'cat', 'head', 'tail', 'wc', 'sort', 'stat', 'sha256sum'],
    maxTokens: 1024,
    maxTotalTokens: 24576,
  },
  {
    id: 'data-analyst',
    name: 'Data analyst',
    description: 'Explores datasets, checks quality, and produces evidence-backed summaries.',
    provider: 'openai',
    connectorKey: 'openai-primary',
    model: 'gpt-5.4',
    systemPrompt:
      'You are a rigorous data analyst. Validate inputs, quantify findings, call out uncertainty, and leave reproducible evidence for every conclusion.',
    maxIterations: 16,
    allowedExecutables: ['python3', 'jq', 'rg', 'cat', 'head', 'tail', 'wc', 'sort', 'sha256sum'],
    maxTokens: 1536,
    maxTotalTokens: 49152,
  },
  {
    id: 'quality-reviewer',
    name: 'Quality reviewer',
    description: 'Audits outputs against requirements and reports precise gaps.',
    provider: 'openai',
    connectorKey: 'openai-primary',
    model: 'gpt-5.4',
    systemPrompt:
      'You are an independent quality reviewer. Do not assume work is correct. Compare evidence to the stated objective, identify concrete gaps, and finish with a concise verdict.',
    maxIterations: 8,
    allowedExecutables: ['rg', 'jq', 'cat', 'head', 'tail', 'wc', 'sort', 'stat', 'sha256sum'],
    maxTokens: 1024,
    maxTotalTokens: 16384,
  },
];

export function getDurableAgentProfile(id: string): DurableAgentProfile | undefined {
  return DURABLE_AGENT_PROFILES.find((profile) => profile.id === id);
}

export function isValidDurableAgentProfile(value: unknown): value is DurableAgentProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  const tools = profile.allowedExecutables;
  return (
    typeof profile.id === 'string' &&
    profile.id.trim().length > 0 &&
    profile.id.length <= 128 &&
    typeof profile.name === 'string' &&
    profile.name.trim().length > 0 &&
    profile.name.length <= 80 &&
    typeof profile.description === 'string' &&
    profile.description.length <= 240 &&
    profile.provider === 'openai' &&
    (profile.connectorKey === undefined ||
      (typeof profile.connectorKey === 'string' &&
        profile.connectorKey.trim().length > 0 &&
        profile.connectorKey.length <= 128)) &&
    typeof profile.model === 'string' &&
    profile.model.length > 0 &&
    profile.model.length <= 128 &&
    typeof profile.systemPrompt === 'string' &&
    profile.systemPrompt.trim().length > 0 &&
    profile.systemPrompt.length <= 12_000 &&
    typeof profile.maxIterations === 'number' &&
    Number.isInteger(profile.maxIterations) &&
    profile.maxIterations >= 1 &&
    profile.maxIterations <= 50 &&
    Array.isArray(tools) &&
    tools.length > 0 &&
    tools.length <= DURABLE_AGENT_EXECUTABLES.length &&
    tools.every(
      (tool) =>
        typeof tool === 'string' &&
        DURABLE_AGENT_EXECUTABLES.includes(tool as (typeof DURABLE_AGENT_EXECUTABLES)[number])
    ) &&
    new Set(tools).size === tools.length &&
    typeof profile.maxTokens === 'number' &&
    Number.isInteger(profile.maxTokens) &&
    profile.maxTokens >= 128 &&
    profile.maxTokens <= 4096 &&
    typeof profile.maxTotalTokens === 'number' &&
    Number.isInteger(profile.maxTotalTokens) &&
    profile.maxTotalTokens >= profile.maxTokens &&
    profile.maxTotalTokens <= 200_000
  );
}

export function isValidCustomAgentProfile(value: unknown): value is DurableAgentProfile {
  return (
    isValidDurableAgentProfile(value) && (value as DurableAgentProfile).id.startsWith('custom-')
  );
}
