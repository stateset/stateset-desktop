import type { AgentTemplate } from '../types';

/**
 * Built-in agent templates.
 * These ship with the app and cannot be deleted.
 */
export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
  {
    id: 'interactive',
    name: 'Interactive Assistant',
    description: 'A conversational agent for direct chat interactions',
    icon: 'MessageSquare',
    color: 'bg-brand-600',
    category: 'general',
    agentType: 'interactive',
    config: {
      mcp_servers: [],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: false,
    },
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handles customer inquiries and support tickets',
    icon: 'HelpCircle',
    color: 'bg-purple-600',
    category: 'support',
    agentType: 'interactive',
    config: {
      mcp_servers: ['gorgias'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5,
      loop_interval_ms: 2000,
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: true,
      custom_instructions:
        'Be helpful, professional, and empathetic. Always verify customer identity before discussing account details.',
    },
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Agent',
    description: 'Manages orders, products, and fulfillment',
    icon: 'ShoppingCart',
    color: 'bg-green-600',
    category: 'commerce',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      loop_interval_ms: 2000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: true,
      custom_instructions:
        'Focus on order accuracy and customer satisfaction. Double-check order details before making changes.',
    },
  },
  {
    id: 'autonomous',
    name: 'Autonomous Agent',
    description: 'Self-directed agent with full platform access',
    icon: 'Zap',
    color: 'bg-amber-600',
    category: 'automation',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify', 'gorgias'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5,
      loop_interval_ms: 5000,
      max_iterations: 200,
      iteration_timeout_secs: 600,
      pause_on_error: false,
    },
  },
  {
    id: 'ticket-triage',
    name: 'Ticket Triage',
    description: 'Automatically categorizes and routes support tickets',
    icon: 'Tag',
    color: 'bg-cyan-600',
    category: 'support',
    agentType: 'interactive',
    config: {
      mcp_servers: ['gorgias'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      loop_interval_ms: 3000,
      max_iterations: 500,
      iteration_timeout_secs: 120,
      pause_on_error: true,
      custom_instructions:
        'Categorize each ticket by urgency (low/medium/high/critical) and topic (billing, shipping, product, account, other). Apply tags and route to the appropriate team.',
    },
  },
  {
    id: 'order-monitor',
    name: 'Order Monitor',
    description: 'Watches for fulfillment issues and delayed shipments',
    icon: 'PackageSearch',
    color: 'bg-orange-600',
    category: 'commerce',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify', 'shipstation'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.1,
      loop_interval_ms: 10000,
      max_iterations: 1000,
      iteration_timeout_secs: 60,
      pause_on_error: true,
      custom_instructions:
        'Monitor orders for fulfillment delays, carrier exceptions, and delivery failures. Alert on orders unfulfilled for more than 48 hours.',
    },
  },
  {
    id: 'returns-handler',
    name: 'Returns & Refunds',
    description: 'Processes return requests and issues refunds per policy',
    icon: 'RotateCcw',
    color: 'bg-rose-600',
    category: 'commerce',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify', 'gorgias'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      loop_interval_ms: 2000,
      max_iterations: 100,
      iteration_timeout_secs: 300,
      pause_on_error: true,
      custom_instructions:
        'Process return and refund requests according to the store return policy. Verify order age, item condition eligibility, and process refunds to the original payment method.',
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyzes business metrics and generates reports',
    icon: 'BarChart3',
    color: 'bg-indigo-600',
    category: 'automation',
    agentType: 'interactive',
    config: {
      mcp_servers: ['shopify'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.4,
      loop_interval_ms: 5000,
      max_iterations: 50,
      iteration_timeout_secs: 600,
      pause_on_error: false,
      custom_instructions:
        'Analyze sales trends, customer behavior, and product performance. Provide actionable insights with supporting data.',
    },
  },
];

/** Map icon name strings to lucide-react component names */
export const TEMPLATE_ICON_MAP: Record<string, string> = {
  MessageSquare: 'MessageSquare',
  HelpCircle: 'HelpCircle',
  ShoppingCart: 'ShoppingCart',
  Zap: 'Zap',
  Tag: 'Tag',
  PackageSearch: 'PackageSearch',
  RotateCcw: 'RotateCcw',
  BarChart3: 'BarChart3',
  Bot: 'Bot',
};

export const TEMPLATE_CATEGORIES = [
  { id: 'all' as const, label: 'All' },
  { id: 'general' as const, label: 'General' },
  { id: 'support' as const, label: 'Support' },
  { id: 'commerce' as const, label: 'Commerce' },
  { id: 'automation' as const, label: 'Automation' },
  { id: 'custom' as const, label: 'My Templates' },
];
