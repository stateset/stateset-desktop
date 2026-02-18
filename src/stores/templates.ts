import { create } from 'zustand';
import type { AgentTemplate } from '../types';
import { BUILT_IN_TEMPLATES } from '../lib/agentTemplates';
import { useAuditLogStore } from './auditLog';

interface TemplatesState {
  customTemplates: AgentTemplate[];
  isLoaded: boolean;
  initialize: () => Promise<void>;
  addCustomTemplate: (template: AgentTemplate) => Promise<void>;
  removeCustomTemplate: (id: string) => Promise<void>;
  getAllTemplates: () => AgentTemplate[];
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  customTemplates: [],
  isLoaded: false,

  initialize: async () => {
    if (get().isLoaded) return;
    try {
      if (typeof window.electronAPI !== 'undefined') {
        const stored = await window.electronAPI.store.get('customAgentTemplates');
        if (Array.isArray(stored)) {
          set({ customTemplates: stored as AgentTemplate[], isLoaded: true });
          return;
        }
      }
    } catch {
      // Ignore load errors, start with empty
    }
    set({ isLoaded: true });
  },

  addCustomTemplate: async (template: AgentTemplate) => {
    const updated = [...get().customTemplates, { ...template, isCustom: true }];
    set({ customTemplates: updated });
    try {
      if (typeof window.electronAPI !== 'undefined') {
        await window.electronAPI.store.set('customAgentTemplates', updated);
      }
    } catch {
      // Best effort persist
    }
    useAuditLogStore
      .getState()
      .log('template.created', `Created template "${template.name}"`, { templateId: template.id });
  },

  removeCustomTemplate: async (id: string) => {
    const removed = get().customTemplates.find((t) => t.id === id);
    const updated = get().customTemplates.filter((t) => t.id !== id);
    set({ customTemplates: updated });
    try {
      if (typeof window.electronAPI !== 'undefined') {
        await window.electronAPI.store.set('customAgentTemplates', updated);
      }
    } catch {
      // Best effort persist
    }
    useAuditLogStore
      .getState()
      .log('template.deleted', `Deleted template "${removed?.name || id}"`, { templateId: id });
  },

  getAllTemplates: () => {
    return [...BUILT_IN_TEMPLATES, ...get().customTemplates];
  },
}));
