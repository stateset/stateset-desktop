import { create } from 'zustand';
import type { AuditAction, AuditEntry } from '../lib/auditLog';

interface AuditLogState {
  entries: AuditEntry[];
  isLoaded: boolean;
  initialize: () => Promise<void>;
  log: (action: AuditAction, description: string, metadata?: Record<string, unknown>) => void;
  clear: () => Promise<void>;
}

const MAX_ENTRIES = 500;

export const useAuditLogStore = create<AuditLogState>((set, get) => ({
  entries: [],
  isLoaded: false,

  initialize: async () => {
    if (get().isLoaded) return;
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        const saved = await window.electronAPI.store.get('auditLog');
        if (Array.isArray(saved)) {
          set({ entries: saved as AuditEntry[], isLoaded: true });
          return;
        }
      }
    } catch {
      // ignore load errors
    }
    set({ isLoaded: true });
  },

  log: (action, description, metadata) => {
    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      action,
      description,
      metadata,
      timestamp: Date.now(),
    };

    set((state) => {
      const entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
      // Persist async, don't block
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.store?.set) {
          Promise.resolve(window.electronAPI.store.set('auditLog', entries)).catch((err) => {
            console.warn('[AuditLog] Failed to persist:', err);
          });
        }
      } catch {
        // ignore persist errors
      }
      return { entries };
    });
  },

  clear: async () => {
    set({ entries: [] });
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.store) {
        await window.electronAPI.store.set('auditLog', []);
      }
    } catch {
      // ignore persist errors
    }
  },
}));
