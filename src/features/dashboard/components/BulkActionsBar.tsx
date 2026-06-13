import { PlayCircle, StopCircle } from 'lucide-react';
import { getStartableSelection, getStoppableSelection } from '../utils/sessionFilters';
import type { AgentSession } from '../../../types';

interface BulkActionsBarProps {
  sessions: AgentSession[];
  selectedIds: Set<string>;
  visibleCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkStart: () => void;
  onBulkStop: () => void;
}

/** Toolbar shown when sessions are selected: select-all, bulk start/stop. */
export function BulkActionsBar({
  sessions,
  selectedIds,
  visibleCount,
  onSelectAll,
  onClearSelection,
  onBulkStart,
  onBulkStop,
}: BulkActionsBarProps) {
  if (selectedIds.size === 0) return null;

  const canStartSelected = getStartableSelection(sessions, selectedIds).length > 0;
  const canStopSelected = getStoppableSelection(sessions, selectedIds).length > 0;

  return (
    <div className="px-5 py-2.5 border-b border-slate-700/40 bg-brand-500/5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selectedIds.size === visibleCount}
          onChange={onSelectAll}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500/40 cursor-pointer"
          aria-label="Select all visible agents"
        />
        <span className="text-sm font-medium text-brand-300" role="status" aria-live="polite">
          {selectedIds.size} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
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
          disabled={!canStartSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-emerald-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
        >
          <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Start Selected
        </button>
        <button
          type="button"
          onClick={onBulkStop}
          disabled={!canStopSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-rose-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
        >
          <StopCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Stop Selected
        </button>
      </div>
    </div>
  );
}
