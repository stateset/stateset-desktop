/**
 * Agent Configuration
 * Default settings and templates for agents
 */

import type { AgentSessionConfig } from '../types';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: Partial<AgentSessionConfig>;
}

/** Default configuration for new agents */
export const DEFAULT_AGENT_CONFIG: Partial<AgentSessionConfig> = {
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  max_iterations: 50,
  iteration_timeout_secs: 30,
  loop_interval_ms: 1000,
  pause_on_error: true,
  mcp_servers: [],
  custom_instructions: '',
};

/** Available models for agent configuration */
export const AVAILABLE_MODELS = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Balanced performance and speed',
  },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Highest capability model' },
  { id: 'claude-haiku-3-20250514', name: 'Claude Haiku 3', description: 'Fast and efficient' },
] as const;

/** Pre-configured agent templates */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'interactive',
    name: 'Interactive Assistant',
    description:
      'A responsive assistant for real-time conversations. Best for general Q&A and interactive help.',
    icon: 'MessageSquare',
    config: {
      ...DEFAULT_AGENT_CONFIG,
      mcp_servers: [],
      custom_instructions:
        'You are a helpful assistant. Be concise and friendly in your responses.',
    },
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description:
      'Handles customer inquiries with access to support tools. Great for ticket resolution.',
    icon: 'HeadphonesIcon',
    config: {
      ...DEFAULT_AGENT_CONFIG,
      temperature: 0.5,
      max_iterations: 100,
      custom_instructions: `You are a customer support agent. Your goals are to:
1. Understand the customer's issue clearly
2. Provide helpful and accurate solutions
3. Escalate complex issues when necessary
4. Maintain a professional and empathetic tone`,
    },
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Agent',
    description: 'Manages orders, inventory, and customer interactions for online stores.',
    icon: 'ShoppingCart',
    config: {
      ...DEFAULT_AGENT_CONFIG,
      temperature: 0.3,
      max_iterations: 200,
      loop_interval_ms: 2000,
      custom_instructions: `You are an e-commerce operations agent. You help with:
1. Order processing and status updates
2. Inventory management
3. Customer inquiries about products and shipping
4. Return and refund processing`,
    },
  },
  {
    id: 'autonomous',
    name: 'Autonomous Worker',
    description:
      'Runs background tasks independently with minimal supervision. Ideal for scheduled jobs.',
    icon: 'Cpu',
    config: {
      ...DEFAULT_AGENT_CONFIG,
      temperature: 0.2,
      max_iterations: 500,
      loop_interval_ms: 5000,
      pause_on_error: false,
      custom_instructions: `You are an autonomous agent running background tasks.
Work independently to complete assigned tasks.
Log your progress and any issues encountered.
Continue working even if individual operations fail.`,
    },
  },
];

/** Agent behavior presets */
export const AGENT_PRESETS = {
  conservative: {
    name: 'Conservative',
    description: 'Lower temperature, fewer iterations, pauses on error',
    config: {
      temperature: 0.2,
      max_iterations: 25,
      pause_on_error: true,
    },
  },
  balanced: {
    name: 'Balanced',
    description: 'Default settings for most use cases',
    config: {
      temperature: 0.7,
      max_iterations: 50,
      pause_on_error: true,
    },
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Higher temperature, more iterations, continues on error',
    config: {
      temperature: 1.0,
      max_iterations: 200,
      pause_on_error: false,
    },
  },
} as const;

export type AgentPresetKey = keyof typeof AGENT_PRESETS;
