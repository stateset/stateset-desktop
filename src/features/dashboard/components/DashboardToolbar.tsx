import {
  Search,
  Filter,
  X,
  PlayCircle,
  StopCircle,
  FileJson,
  FileSpreadsheet,
  BarChart3,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { TagFilter } from '../../../components/TagBadge';

type StatusFilter = 'all' | 'running' | 'stopped' | 'failed';

interface DashboardToolbarProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  allTags: string[];
  selectedTags: Set<string>;
  runningCount: number;
  stoppedCount: number;
  sessionsCount: number;
  isStartingAll: boolean;
  isStoppingAll: boolean;
  isDeletingStopped: boolean;
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

export function DashboardToolbar({
  searchQuery,
  statusFilter,
  allTags,
  selectedTags,
  runningCount,
  stoppedCount,
  sessionsCount,
  isStartingAll,
  isStoppingAll,
  isDeletingStopped,
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
  return (
    <>
      {/* Search and Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={searchInputRef as React.RefObject<HTMLInputElement>}
            type="text"
            placeholder="Search agents... (press / to focus)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search agents"
            className="w-full pl-10 pr-10 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-700 rounded"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {(['all', 'running', 'stopped', 'failed'] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => onStatusFilterChange(filter)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Tags:</span>
          <TagFilter allTags={allTags} selectedTags={selectedTags} onToggleTag={onToggleTag} />
          {selectedTags.size > 0 && (
            <button
              onClick={onClearTags}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onStartAll}
          disabled={stoppedCount === 0 || isStartingAll}
          className="flex items-center gap-2 px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isStartingAll ? (
            <div className="w-4 h-4 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          ) : (
            <PlayCircle className="w-4 h-4" />
          )}
          Start All ({stoppedCount})
        </button>

        <button
          onClick={onStopAll}
          disabled={runningCount === 0 || isStoppingAll}
          className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isStoppingAll ? (
            <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
          ) : (
            <StopCircle className="w-4 h-4" />
          )}
          Stop All ({runningCount})
        </button>

        <button
          onClick={onDeleteStopped}
          disabled={stoppedCount === 0 || isDeletingStopped}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isDeletingStopped ? (
            <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          Delete Stopped ({stoppedCount})
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onExportJSON}
            disabled={sessionsCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Export as JSON"
          >
            <FileJson className="w-4 h-4" />
            JSON
          </button>
          <button
            onClick={onExportCSV}
            disabled={sessionsCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Export as CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={onExportMetrics}
            disabled={sessionsCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Export metrics summary"
          >
            <BarChart3 className="w-4 h-4" />
            Metrics
          </button>
        </div>
      </div>
    </>
  );
}
