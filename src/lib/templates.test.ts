import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getTemplatesByPlatform,
  searchTemplates,
  templateToAgentConfig,
  type AgentTemplate,
} from './templates';

describe('templates helpers', () => {
  it('finds a template by id', () => {
    const template = getTemplateById('customer-support-gorgias');
    expect(template?.name).toBe('Customer Support Agent');
  });

  it('returns undefined for unknown template id', () => {
    expect(getTemplateById('missing-template')).toBeUndefined();
  });

  it('filters templates by category', () => {
    const customerSupport = getTemplatesByCategory('customer-support');
    expect(customerSupport.length).toBeGreaterThan(0);
    expect(customerSupport.every((t) => t.category === 'customer-support')).toBe(true);
  });

  it('filters templates by platform', () => {
    const shopifyTemplates = getTemplatesByPlatform('shopify');
    expect(shopifyTemplates.length).toBeGreaterThan(0);
    expect(shopifyTemplates.every((t) => t.platforms.includes('shopify'))).toBe(true);
  });

  it('searches by name, description, and tags case-insensitively', () => {
    const byName = searchTemplates('customer support');
    const byDescription = searchTemplates('analytics reports');
    const byTag = searchTemplates('SHIPPING');

    expect(byName.some((t) => t.id === 'customer-support-gorgias')).toBe(true);
    expect(byDescription.some((t) => t.id === 'analytics-reporter')).toBe(true);
    expect(byTag.some((t) => t.id === 'order-fulfillment-shopify')).toBe(true);
  });

  it('converts partial template config to full session config with defaults', () => {
    const template: AgentTemplate = {
      id: 'temp',
      name: 'Temp',
      description: 'Temp',
      category: 'custom',
      icon: 'Settings',
      config: {
        loop_interval_ms: 7000,
        pause_on_error: false,
      },
      tags: [],
      difficulty: 'beginner',
      platforms: [],
    };

    const config = templateToAgentConfig(template);
    expect(config.loop_interval_ms).toBe(7000);
    expect(config.pause_on_error).toBe(false);
    expect(config.max_iterations).toBe(25);
    expect(config.iteration_timeout_secs).toBe(30);
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(config.temperature).toBe(0.7);
    expect(config.mcp_servers).toEqual([]);
  });

  it('template catalog includes the custom-template entry', () => {
    expect(TEMPLATES.some((template) => template.id === 'custom-template')).toBe(true);
  });
});
