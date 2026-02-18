/**
 * Agent Templates Marketplace
 *
 * Pre-configured agent templates for common use cases.
 * Users can browse, select, and customize templates for their specific needs.
 */

import type { AgentSessionConfig } from '../types';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'customer-support' | 'order-fulfillment' | 'inquiry' | 'data-processing' | 'custom';
  icon: string;
  config: Partial<AgentSessionConfig>;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  platforms: string[];
  estimatedCost?: string;
}

export const TEMPLATES: AgentTemplate[] = [
  {
    id: 'customer-support-gorgias',
    name: 'Customer Support Agent',
    description:
      'Handles customer support inquiries using Gorgias. Responds to common questions, escalates complex issues, and maintains conversation logs.',
    category: 'customer-support',
    icon: 'MessageSquare',
    config: {
      agent_type: 'customer-support',
      loop_interval_ms: 5000,
      max_iterations: 50,
      iteration_timeout_secs: 30,
      pause_on_error: true,
      mcp_servers: ['gorgias', 'zendesk'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      custom_instructions:
        'You are a helpful customer support agent. Be friendly, professional, and concise. Always verify user identities before accessing order information. For complex issues, escalate to a human agent.',
    },
    tags: ['support', 'gorgias', 'zendesk', 'tickets'],
    difficulty: 'beginner',
    platforms: ['gorgias', 'zendesk'],
    estimatedCost: '~$2-5 per 100 tickets',
  },
  {
    id: 'order-fulfillment-shopify',
    name: 'Order Fulfillment Agent',
    description:
      'Automatically processes and fulfills orders from Shopify. Manages inventory, handles shipping, and sends notifications.',
    category: 'order-fulfillment',
    icon: 'Package',
    config: {
      agent_type: 'order-fulfillment',
      loop_interval_ms: 10000,
      max_iterations: 100,
      iteration_timeout_secs: 60,
      pause_on_error: true,
      mcp_servers: ['shopify', 'shipstation'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5,
      custom_instructions:
        'Monitor for new orders and process them automatically. Verify stock levels before fulfilling. Handle shipping label generation and tracking updates. Report any errors or low stock immediately.',
    },
    tags: ['ecommerce', 'shopify', 'fulfillment', 'shipping'],
    difficulty: 'intermediate',
    platforms: ['shopify', 'shipstation'],
    estimatedCost: '~$3-8 per 1000 orders',
  },
  {
    id: 'product-inquiry-shipstation',
    name: 'Product Inquiry Agent',
    description:
      'Responds to customer inquiries about products, availability, and recommendations using ShipStation data.',
    category: 'inquiry',
    icon: 'Search',
    config: {
      agent_type: 'product-inquiry',
      loop_interval_ms: 3000,
      max_iterations: 30,
      iteration_timeout_secs: 20,
      pause_on_error: false,
      mcp_servers: ['shopify', 'shipstation'],
      model: 'claude-haiku-3-20250514',
      temperature: 0.6,
      custom_instructions:
        'Help customers find products and answer questions about availability. Suggest alternatives when items are out of stock. Keep responses concise and helpful.',
    },
    tags: ['inquiry', 'products', 'shopify', 'recommendations'],
    difficulty: 'beginner',
    platforms: ['shopify', 'shipstation'],
    estimatedCost: '~$0.5-1 per 100 inquiries',
  },
  {
    id: 'data-sync-k8s',
    name: 'Data Sync Agent',
    description:
      'Syncs data between platforms, handles reconciliation, and maintains data integrity. Ideal for multi-platform inventory.',
    category: 'data-processing',
    icon: 'Database',
    config: {
      agent_type: 'data-sync',
      loop_interval_ms: 60000,
      max_iterations: 500,
      iteration_timeout_secs: 120,
      pause_on_error: true,
      mcp_servers: ['shopify', 'klaviyo', 'recharge'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      custom_instructions:
        'Continuously sync data between platforms. Maintain consistency and handle conflicts gracefully. Log all sync operations and report discrepancies.',
    },
    tags: ['sync', 'integration', 'inventory', 'reconciliation'],
    difficulty: 'advanced',
    platforms: ['shopify', 'klaviyo', 'recharge'],
    estimatedCost: '~$10-20 per hour of sync',
  },
  {
    id: 'analytics-reporter',
    name: 'Analytics Reporter',
    description:
      'Generates daily, weekly, and monthly analytics reports across all connected platforms.',
    category: 'data-processing',
    icon: 'BarChart3',
    config: {
      agent_type: 'analytics',
      loop_interval_ms: 86400000, // 24 hours
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: false,
      mcp_servers: ['shopify', 'klaviyo'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.4,
      custom_instructions:
        'Generate comprehensive analytics reports. Include key metrics, trends, and actionable insights. Format reports for business stakeholders.',
    },
    tags: ['analytics', 'reporting', 'metrics', 'insights'],
    difficulty: 'intermediate',
    platforms: ['shopify', 'klaviyo'],
    estimatedCost: '~$2-5 per report',
  },
  {
    id: 'subscription-manager-recharge',
    name: 'Subscription Manager',
    description:
      'Manages subscription renewals, cancellations, and modifications through Recharge.',
    category: 'order-fulfillment',
    icon: 'RefreshCw',
    config: {
      agent_type: 'subscription-manager',
      loop_interval_ms: 15000,
      max_iterations: 75,
      iteration_timeout_secs: 45,
      pause_on_error: true,
      mcp_servers: ['recharge', 'shopify'],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.6,
      custom_instructions:
        'Manage the full subscription lifecycle automatically. Process renewals, handle failed payments, and manage cancellations or modifications. Communicate clearly with customers about subscription events.',
    },
    tags: ['subscriptions', 'recharge', 'billing', 'renewals'],
    difficulty: 'intermediate',
    platforms: ['recharge', 'shopify'],
    estimatedCost: '~$5-10 per 100 subscriptions/month',
  },
  {
    id: 'marketing-campaign-klaviyo',
    name: 'Marketing Campaign Agent',
    description:
      'Creates and launches targeted marketing campaigns based on customer behavior and sales data.',
    category: 'customer-support',
    icon: 'Target',
    config: {
      agent_type: 'marketing',
      loop_interval_ms: 3600000, // 1 hour
      max_iterations: 40,
      iteration_timeout_secs: 180,
      pause_on_error: false,
      mcp_servers: ['klaviyo', 'shopify'],
      model: 'claude-opus-4-20250514',
      temperature: 0.8,
      custom_instructions:
        'Analyze customer behavior and sales data to identify campaign opportunities. Create personalized email and SMS campaigns. Monitor campaign performance and optimize in real-time.',
    },
    tags: ['marketing', 'email', 'sms', 'campaigns'],
    difficulty: 'advanced',
    platforms: ['klaviyo', 'shopify'],
    estimatedCost: '~$5-15 per campaign',
  },
  {
    id: 'custom-template',
    name: 'Custom Agent',
    description: 'Build a custom agent from scratch with your own configuration and instructions.',
    category: 'custom',
    icon: 'Settings2',
    config: {
      agent_type: 'custom',
      loop_interval_ms: 1000,
      max_iterations: 25,
      iteration_timeout_secs: 30,
      pause_on_error: true,
      mcp_servers: [],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
    },
    tags: ['custom', 'flexible'],
    difficulty: 'beginner',
    platforms: [],
    estimatedCost: 'Varies based on configuration',
  },
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): AgentTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: AgentTemplate['category']): AgentTemplate[] {
  return TEMPLATES.filter((template) => template.category === category);
}

/**
 * Get templates by platform
 */
export function getTemplatesByPlatform(platform: string): AgentTemplate[] {
  return TEMPLATES.filter((template) => template.platforms.includes(platform));
}

/**
 * Search templates by name or tags
 */
export function searchTemplates(query: string): AgentTemplate[] {
  const lowerQuery = query.toLowerCase();
  return TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Convert template config to full AgentSessionConfig
 */
export function templateToAgentConfig(template: AgentTemplate): AgentSessionConfig {
  return {
    loop_interval_ms: template.config.loop_interval_ms || 1000,
    max_iterations: template.config.max_iterations || 25,
    iteration_timeout_secs: template.config.iteration_timeout_secs || 30,
    pause_on_error: template.config.pause_on_error ?? true,
    custom_instructions: template.config.custom_instructions,
    mcp_servers: template.config.mcp_servers || [],
    model: template.config.model || 'claude-sonnet-4-20250514',
    temperature: template.config.temperature || 0.7,
  };
}
