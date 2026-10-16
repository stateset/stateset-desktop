import { Plus, Command, RefreshCw, WifiOff } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Spinner } from '../../../components/Spinner';
import { pageSectionVariants } from '../../../lib/animations';

interface DashboardHeaderProps {
  greeting: string;
  sessionsCount: number;
  runningCount: number;
  isLoading: boolean;
  isFetching?: boolean;
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
  isFetching = false,
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
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              {runningCount > 0
                ? `${runningCount} agent${runningCount !== 1 ? 's' : ''} running`
                : 'No agents running'}
              <span aria-hidden="true">·</span>
              <span>
                {sessionsCount} agent{sessionsCount !== 1 ? 's' : ''} total
              </span>
            </span>
          ) : (
            <span>Manage your autonomous AI agents</span>
          )}
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-xs font-medium ui-warning">
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
          className="ui-button ui-button-secondary flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          title="Command palette (Ctrl/Cmd+K)"
          aria-label="Commands ⌘K"
        >
          <Command className="w-3.5 h-3.5" aria-hidden="true" />
          <kbd className="text-[10px] font-bold tracking-widest uppercase">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching || !isOnline}
          aria-busy={isFetching}
          className="ui-button ui-button-secondary p-2 rounded-lg"
          title="Refresh (Ctrl/Cmd+R)"
          aria-label="Refresh sessions"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate || isCreating}
          className="ui-button ui-button-primary flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
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
