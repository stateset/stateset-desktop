import { describe, it, expect } from 'vitest';
import { BUILT_IN_TEMPLATES, TEMPLATE_ICON_MAP, TEMPLATE_CATEGORIES } from './agentTemplates';

describe('BUILT_IN_TEMPLATES', () => {
  it('has exactly 8 templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(8);
  });

  it('all templates have required fields', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.agentType).toBeTruthy();
      expect(t.config).toBeDefined();
    }
  });

  it('all template IDs are unique', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all categories are valid', () => {
    const validCategories = ['general', 'support', 'commerce', 'automation'];
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validCategories).toContain(t.category);
    }
  });

  it('all configs have model, temperature, and mcp_servers', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.config.model).toBeTruthy();
      expect(typeof t.config.temperature).toBe('number');
      expect(Array.isArray(t.config.mcp_servers)).toBe(true);
    }
  });

  it('none have isCustom set to true', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.isCustom).toBeFalsy();
    }
  });

  it('all icons reference keys in TEMPLATE_ICON_MAP', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.icon in TEMPLATE_ICON_MAP).toBe(true);
    }
  });
});

describe('TEMPLATE_CATEGORIES', () => {
  it('has expected entries including all and custom', () => {
    const ids = TEMPLATE_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('all');
    expect(ids).toContain('custom');
    expect(ids).toContain('general');
    expect(ids).toContain('support');
    expect(ids).toContain('commerce');
    expect(ids).toContain('automation');
  });
});
