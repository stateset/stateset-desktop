import { PlayCircle, StopCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getStartableSelection, getStoppableSelection } from '../utils/sessionFilters';
import type { AgentSession } from '../../../types';

interface BulkActionsBarProps {
  visibleSessions: AgentSession[];
  selectedIds: Set<string>;
  isBusy?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkStart: () => void;
  onBulkStop: () => void;
}

/** Toolbar shown when sessions are selected: select-all, bulk start/stop. */
export function BulkActionsBar({
  visibleSessions,
  selectedIds,
  isBusy = false,
  onSelectAll,
  onClearSelection,
  onBulkStart,
  onBulkStop,
}: BulkActionsBarProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const selectedCount = visibleSessions.filter((session) => selectedIds.has(session.id)).length;
  const allSelected = selectedCount > 0 && selectedCount === visibleSessions.length;
  const isMixed = selectedCount > 0 && !allSelected;
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = isMixed;
  }, [isMixed]);

  if (selectedCount === 0) return null;

  const canStartSelected = getStartableSelection(visibleSessions, selectedIds).length > 0;
  const canStopSelected = getStoppableSelection(visibleSessions, selectedIds).length > 0;

  return (
    <div
      role="group"
      aria-label="Agent selection"
      aria-busy={isBusy}
      className="px-5 py-2.5 border-b border-slate-700/40 bg-slate-800/40 flex flex-wrap gap-3 items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          ref={checkboxRef}
          checked={allSelected}
          onChange={onSelectAll}
          disabled={isBusy}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500/40 cursor-pointer"
          aria-label="Select all visible agents"
        />
        <span className="text-sm font-medium text-gray-300" role="status" aria-live="polite">
          {isBusy ? `${selectedCount} selected · actions in progress` : `${selectedCount} selected`}
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={isBusy}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Clear selection"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBulkStart}
          disabled={isBusy || !canStartSelected}
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
        >
          <PlayCircle className="w-3.5 h-3.5 ui-positive" aria-hidden="true" />
          Start Selected
        </button>
        <button
          type="button"
          onClick={onBulkStop}
          disabled={isBusy || !canStopSelected}
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
        >
          <StopCircle className="w-3.5 h-3.5 ui-negative" aria-hidden="true" />
          Stop Selected
        </button>
      </div>
    </div>
  );
}
