import { useState, useCallback } from 'react';
import type { AgentSession } from '../../../types';

/**
 * Bulk-selection state for the sessions list.
 * Selection is keyed by session id and scoped to the currently visible page.
 */
export function useSessionSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /** Select every visible session; if all are already selected, clear instead. */
  const selectAllVisible = useCallback((visibleSessions: AgentSession[]) => {
    setSelectedIds((prev) => {
      if (visibleSessions.length > 0 && visibleSessions.every((session) => prev.has(session.id))) {
        return new Set<string>();
      }
      return new Set(visibleSessions.map((s) => s.id));
    });
  }, []);

  /** Drop selections that disappeared from the current page after paging or refresh. */
  const retainVisible = useCallback((visibleSessions: AgentSession[]) => {
    const visibleIds = new Set(visibleSessions.map((session) => session.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  return { selectedIds, toggleSelect, clearSelection, selectAllVisible, retainVisible };
}
