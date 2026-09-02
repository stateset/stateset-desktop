import { Plus, Command, RefreshCw, WifiOff } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Spinner } from '../../../components/Spinner';
import { pageSectionVariants } from '../../../lib/animations';

interface DashboardHeaderProps {
  greeting: string;
  sessionsCount: number;
  runningCount: number;
  isLoading: boolean;
  isOnline: boolean;
  isCreating: boolean;
  canCreate: boolean;
  onOpenCommandPalette: () => void;
  onRefresh: () => void;
  onCreate: () => void;
}

/** Page header: greeting, fleet status summary, and primary actions. */
export function DashboardHeader({
  greeting,
  sessionsCount,
  runningCount,
  isLoading,
  isOnline,
  isCreating,
  canCreate,
  onOpenCommandPalette,
  onRefresh,
  onCreate,
}: DashboardHeaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={reduceMotion ? undefined : pageSectionVariants}
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 mt-2"
    >
      <div>
        <h1 className="page-title">{greeting}</h1>
        <p className="page-subtitle flex items-center gap-2 mt-1">
          {sessionsCount > 0 && !isLoading ? (
            <span className="flex items-center gap-2">
              {runningCount > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              {runningCount > 0
                ? `${runningCount} agent${runningCount !== 1 ? 's' : ''} running`
                : 'No agents running'}
              {sessionsCount > runningCount && <span className="text-gray-600">·</span>}
              {sessionsCount > runningCount && <span>{sessionsCount - runningCount} idle</span>}
            </span>
          ) : (
            <span>Manage your autonomous AI agents</span>
          )}
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              <WifiOff className="w-3 h-3" aria-hidden="true" />
              Offline
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/40 hover:bg-slate-800/60 rounded-xl text-sm font-medium text-gray-400 border border-slate-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 shadow-sm"
          title="Command palette (Ctrl/Cmd+K)"
          aria-label="Open command palette"
        >
          <Command className="w-3.5 h-3.5" aria-hidden="true" />
          <kbd className="text-[10px] font-bold tracking-widest uppercase">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="p-2 bg-slate-800/40 hover:bg-slate-800/60 rounded-xl border border-slate-700/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 shadow-sm"
          title="Refresh (Ctrl/Cmd+R)"
          aria-label="Refresh sessions"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate || isCreating}
          className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-gray-400 rounded-xl font-bold text-sm border border-white/10 transition-all shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          title="New Agent (Ctrl/Cmd+N)"
          aria-label="Create new agent"
        >
          {isCreating ? (
            <Spinner size="md" />
          ) : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Agent</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
