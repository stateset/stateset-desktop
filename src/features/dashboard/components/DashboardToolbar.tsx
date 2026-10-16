import {
  Search,
  X,
  PlayCircle,
  StopCircle,
  FileJson,
  FileSpreadsheet,
  BarChart3,
  Trash2,
  Download,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { TagFilter } from '../../../components/TagBadge';
import { Spinner } from '../../../components/Spinner';
import { usePopupNavigation } from '../../../hooks/usePopupNavigation';
import { STATUS_FILTERS, type StatusFilter } from '../utils/sessionFilters';

interface DashboardToolbarProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  allTags: string[];
  selectedTags: Set<string>;
  runningCount: number;
  stoppedCount: number;
  sessionsCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  isStartingAll: boolean;
  isStoppingAll: boolean;
  isDeletingStopped: boolean;
  isBusy?: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onDeleteStopped: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onExportMetrics: () => void;
}

/**
 * Card header for the sessions panel: title, search, status/tag filters,
 * bulk quick actions, and the export dropdown (whose open state lives here).
 */
export function DashboardToolbar({
  searchQuery,
  statusFilter,
  allTags,
  selectedTags,
  runningCount,
  stoppedCount,
  sessionsCount,
  filteredCount,
  hasActiveFilters,
  isStartingAll,
  isStoppingAll,
  isDeletingStopped,
  isBusy = false,
  searchInputRef,
  onSearchChange,
  onStatusFilterChange,
  onToggleTag,
  onClearTags,
  onStartAll,
  onStopAll,
  onDeleteStopped,
  onExportJSON,
  onExportCSV,
  onExportMetrics,
}: DashboardToolbarProps) {
  const exportMenu = usePopupNavigation('menu');
  const actionsDisabled = isBusy || isStartingAll || isStoppingAll || isDeletingStopped;

  return (
    <div className="dashboard-session-toolbar px-5 py-4 border-b space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg tracking-tight">Agent Sessions</h2>
        <span className="text-xs font-semibold text-gray-500">
          {hasActiveFilters ? `${filteredCount} of ${sessionsCount}` : `${sessionsCount} total`}
        </span>
      </div>

      {/* Search + Filter row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef as React.RefObject<HTMLInputElement>}
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search agents"
            className="w-full pl-9 pr-8 py-2 bg-slate-800/50 border border-slate-700/40 rounded-xl text-sm font-medium placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-inner transition-all text-gray-200"
          />
          <AnimatePresence>
            {searchQuery && (
              <motion.button
                key="clear-search"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-700/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-0.5 bg-slate-800/40 p-0.5 rounded-xl border border-slate-700/40">
          {STATUS_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter}
              onClick={() => onStatusFilterChange(filter)}
              aria-pressed={statusFilter === filter}
              className={clsx(
                'ui-segment px-3 py-1.5 text-xs font-medium rounded-lg transition-colors'
              )}
            >
              {filter === 'running' ? 'Active' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Tags
          </span>
          <TagFilter allTags={allTags} selectedTags={selectedTags} onToggleTag={onToggleTag} />
          {selectedTags.size > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-200 bg-slate-800/40 hover:bg-slate-800/60 px-2 py-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-md"
              aria-label="Clear selected tags"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Quick actions row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onStartAll}
          disabled={stoppedCount === 0 || actionsDisabled}
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        >
          {isStartingAll ? (
            <span aria-hidden="true">
              <Spinner size="md" color="border-t-emerald-400" />
            </span>
          ) : (
            <PlayCircle className="w-3.5 h-3.5 ui-positive" aria-hidden="true" />
          )}
          Start All
          {stoppedCount > 0 && (
            <span className="dashboard-stat-caption text-[10px]">{stoppedCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={onStopAll}
          disabled={runningCount === 0 || actionsDisabled}
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        >
          {isStoppingAll ? (
            <span aria-hidden="true">
              <Spinner size="md" color="border-t-rose-400" />
            </span>
          ) : (
            <StopCircle className="w-3.5 h-3.5 ui-negative" aria-hidden="true" />
          )}
          Stop All
          {runningCount > 0 && (
            <span className="dashboard-stat-caption text-[10px]">{runningCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={onDeleteStopped}
          disabled={stoppedCount === 0 || actionsDisabled}
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        >
          {isDeletingStopped ? (
            <span aria-hidden="true">
              <Spinner size="md" color="border-t-gray-400" />
            </span>
          ) : (
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Clean Up
        </button>

        {/* Export dropdown */}
        <div className="relative ml-auto" {...exportMenu.containerProps}>
          <button
            type="button"
            {...exportMenu.triggerProps}
            disabled={sessionsCount === 0}
            className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export
            <ChevronDown
              className={clsx('w-3 h-3 transition-transform', exportMenu.isOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {exportMenu.isOpen && (
            <div
              {...exportMenu.popupProps}
              aria-label="Export options"
              className="ui-popup absolute right-0 top-full mt-1 w-48 rounded-lg p-1 z-20"
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  onExportJSON();
                  exportMenu.close(true);
                }}
                className="ui-popup-item w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left"
              >
                <FileJson className="w-4 h-4 text-gray-500" aria-hidden="true" />
                JSON
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  onExportCSV();
                  exportMenu.close(true);
                }}
                className="ui-popup-item w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left"
              >
                <FileSpreadsheet className="w-4 h-4 text-gray-500" aria-hidden="true" />
                CSV
              </button>
              <div role="separator" className="ui-popup-separator my-1" />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  onExportMetrics();
                  exportMenu.close(true);
                }}
                className="ui-popup-item w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left"
              >
                <BarChart3 className="w-4 h-4 text-gray-500" aria-hidden="true" />
                Metrics Summary
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
