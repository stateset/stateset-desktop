import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTemplatesStore } from './templates';
import { BUILT_IN_TEMPLATES } from '../lib/agentTemplates';
import type { AgentTemplate } from '../types';

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.stubGlobal('window', {
  electronAPI: { store: { get: mockGet, set: mockSet } },
});

beforeEach(() => {
  useTemplatesStore.setState({ customTemplates: [], isLoaded: false });
  mockGet.mockReset();
  mockSet.mockReset();
});

const makeFakeTemplate = (id: string): AgentTemplate => ({
  id,
  name: `Template ${id}`,
  description: 'Test template',
  icon: 'Bot',
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
});

describe('useTemplatesStore', () => {
  it('has correct initial state', () => {
    const { customTemplates, isLoaded } = useTemplatesStore.getState();
    expect(customTemplates).toEqual([]);
    expect(isLoaded).toBe(false);
  });

  it('initialize() sets isLoaded to true with no electron API data', async () => {
    mockGet.mockResolvedValue(null);
    await useTemplatesStore.getState().initialize();
    expect(useTemplatesStore.getState().isLoaded).toBe(true);
    expect(useTemplatesStore.getState().customTemplates).toEqual([]);
  });

  it('initialize() loads stored templates from electron store', async () => {
    const stored = [makeFakeTemplate('custom-1')];
    mockGet.mockResolvedValue(stored);
    await useTemplatesStore.getState().initialize();
    expect(useTemplatesStore.getState().customTemplates).toHaveLength(1);
    expect(useTemplatesStore.getState().customTemplates[0].id).toBe('custom-1');
  });

  it('initialize() is idempotent', async () => {
    mockGet.mockResolvedValue([]);
    await useTemplatesStore.getState().initialize();
    await useTemplatesStore.getState().initialize();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('initialize() gracefully handles electron store errors', async () => {
    mockGet.mockRejectedValue(new Error('store error'));
    await useTemplatesStore.getState().initialize();
    expect(useTemplatesStore.getState().isLoaded).toBe(true);
    expect(useTemplatesStore.getState().customTemplates).toEqual([]);
  });

  it('addCustomTemplate() appends with isCustom: true and persists', async () => {
    const template = makeFakeTemplate('new-1');
    await useTemplatesStore.getState().addCustomTemplate(template);
    const { customTemplates } = useTemplatesStore.getState();
    expect(customTemplates).toHaveLength(1);
    expect(customTemplates[0].isCustom).toBe(true);
    expect(mockSet).toHaveBeenCalledWith('customAgentTemplates', customTemplates);
  });

  it('removeCustomTemplate() removes by id', async () => {
    const t1 = makeFakeTemplate('t1');
    const t2 = makeFakeTemplate('t2');
    await useTemplatesStore.getState().addCustomTemplate(t1);
    await useTemplatesStore.getState().addCustomTemplate(t2);
    expect(useTemplatesStore.getState().customTemplates).toHaveLength(2);

    await useTemplatesStore.getState().removeCustomTemplate('t1');
    const { customTemplates } = useTemplatesStore.getState();
    expect(customTemplates).toHaveLength(1);
    expect(customTemplates[0].id).toBe('t2');
  });

  it('removeCustomTemplate() is a no-op for nonexistent id', async () => {
    const t1 = makeFakeTemplate('t1');
    await useTemplatesStore.getState().addCustomTemplate(t1);
    await useTemplatesStore.getState().removeCustomTemplate('nonexistent');
    expect(useTemplatesStore.getState().customTemplates).toHaveLength(1);
  });

  it('getAllTemplates() returns built-in + custom', async () => {
    const custom = makeFakeTemplate('custom-1');
    await useTemplatesStore.getState().addCustomTemplate(custom);
    const all = useTemplatesStore.getState().getAllTemplates();
    expect(all).toHaveLength(BUILT_IN_TEMPLATES.length + 1);
    expect(all.slice(0, BUILT_IN_TEMPLATES.length)).toEqual(BUILT_IN_TEMPLATES);
    expect(all[all.length - 1].id).toBe('custom-1');
  });
});
