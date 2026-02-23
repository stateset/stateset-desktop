import type { AgentSession, AgentSessionStatus } from '../../../types';
import { memo, useCallback } from 'react';
import {
  Bot,
  Play,
  Square,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  Copy,
  Clock,
  Hash,
  Wrench,
  Coins,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ContextMenu } from '../../../components/ContextMenu';
import { TagBadge } from '../../../components/TagBadge';

interface DashboardSessionRowProps {
  session: AgentSession;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onClick: (id: string) => void;
  onCopy: (session: AgentSession) => void;
  onExportSummary: (session: AgentSession) => void;
}

const statusConfig: Record<
  AgentSessionStatus,
  { color: string; border: string; iconBg: string; dot: string; label: string }
> = {
  running: {
    color: 'text-emerald-300',
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    dot: 'bg-emerald-500',
    label: 'Running',
  },
  paused: {
    color: 'text-amber-300',
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    dot: 'bg-amber-500',
    label: 'Paused',
  },
  starting: {
    color: 'text-blue-300',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    dot: 'bg-blue-500',
    label: 'Starting',
  },
  stopping: {
    color: 'text-blue-300',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    dot: 'bg-blue-500',
    label: 'Stopping',
  },
  stopped: {
    color: 'text-slate-400',
    border: 'border-l-slate-500',
    iconBg: 'bg-slate-500/10 border-slate-600/20',
    dot: 'bg-slate-500',
    label: 'Stopped',
  },
  failed: {
    color: 'text-rose-300',
    border: 'border-l-rose-500',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    dot: 'bg-rose-500',
    label: 'Failed',
  },
};

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) return `${hours}h ${mins}m`;
  const days = Math.floor(seconds / 86400);
  return `${days}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export const DashboardSessionRow = memo(function DashboardSessionRow({
  session,
  onStart,
  onStop,
  onClick,
  onCopy,
  onExportSummary,
}: DashboardSessionRowProps) {
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const canStart = session.status === 'stopped' || session.status === 'failed';
  const canStop = isRunning || isPaused;
  const agentTypeLabel = session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1);
  const sessionTitle = session.name?.trim() ? session.name : `${agentTypeLabel} Agent`;
  const config = statusConfig[session.status];

  // Loop progress: show if max_iterations is set and reasonable
  const maxIter = session.config.max_iterations;
  const loopProgress =
    maxIter && maxIter > 0 && maxIter <= 10000
      ? Math.min(session.metrics.loop_count / maxIter, 1)
      : null;

  const handleStart = useCallback(() => onStart(session.id), [onStart, session.id]);
  const handleStop = useCallback(() => onStop(session.id), [onStop, session.id]);
  const handleClick = useCallback(() => onClick(session.id), [onClick, session.id]);
  const handleCopy = useCallback(() => onCopy(session), [onCopy, session]);
  const handleExportSummary = useCallback(
    () => onExportSummary(session),
    [onExportSummary, session]
  );

  const contextMenuItems = [
    { id: 'view', label: 'View Details', icon: ChevronRight, onClick: handleClick },
    ...(canStart ? [{ id: 'start', label: 'Start Agent', icon: Play, onClick: handleStart }] : []),
    ...(canStop
      ? [{ id: 'stop', label: 'Stop Agent', icon: Square, onClick: handleStop, danger: true }]
      : []),
    { id: 'copy', label: 'Copy Session Data', icon: Copy, onClick: handleCopy, divider: true },
    { id: 'summary', label: 'Export Run Summary', icon: BarChart3, onClick: handleExportSummary },
  ];

  return (
    <ContextMenu items={contextMenuItems}>
      <div
        className={clsx(
          'relative group border-l-[3px] transition-all duration-200',
          'hover:bg-slate-800/30',
          config.border
        )}
      >
        <button
          type="button"
          className="w-full flex items-center gap-4 px-5 py-3.5 pr-36 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset"
          onClick={handleClick}
          aria-label={`${sessionTitle}, status: ${config.label}, ${session.metrics.loop_count} loops, ${session.metrics.tokens_used} tokens`}
        >
          {/* Agent icon with status color */}
          <div className="relative flex-shrink-0">
            <div
              className={clsx(
                'w-10 h-10 rounded-xl border flex items-center justify-center',
                config.iconBg
              )}
            >
              <Bot className={clsx('w-5 h-5', config.color)} aria-hidden="true" />
            </div>
            {/* Loop progress ring (thin outline around icon) */}
            {loopProgress !== null && (isRunning || isPaused) && (
              <svg
                className="absolute -inset-0.5 -rotate-90"
                width="44"
                height="44"
                viewBox="0 0 44 44"
              >
                <circle
                  cx="22"
                  cy="22"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-700/30"
                  strokeWidth="2"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="20"
                  fill="none"
                  className="text-emerald-500/60"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - loopProgress)}`}
                  style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
                />
              </svg>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="font-bold text-sm text-gray-200 truncate">{sessionTitle}</span>
              <span
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded-md border backdrop-blur-sm',
                  session.status === 'running' &&
                    'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
                  session.status === 'paused' &&
                    'bg-amber-500/10 text-amber-300 border-amber-500/25',
                  (session.status === 'stopped' ||
                    session.status === 'starting' ||
                    session.status === 'stopping') &&
                    'bg-slate-800/60 text-slate-400 border-slate-700/50',
                  session.status === 'failed' && 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                )}
              >
                <span
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full',
                    config.dot,
                    isRunning && 'animate-pulse'
                  )}
                />
                {config.label}
              </span>
              {session.status === 'failed' && (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
              )}
              {session.metrics.errors > 0 && session.status !== 'failed' && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  {session.metrics.errors}
                </span>
              )}
              {session.tags &&
                session.tags.length > 0 &&
                session.tags.slice(0, 3).map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-gray-500">
              {session.name?.trim() && <span className="text-gray-400">{agentTypeLabel}</span>}
              <span className="inline-flex items-center gap-1">
                <Hash className="w-3 h-3" aria-hidden="true" />
                {session.metrics.loop_count}
                {loopProgress !== null && <span className="text-gray-600">/ {maxIter}</span>}
              </span>
              <span className="inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" aria-hidden="true" />
                {session.metrics.tool_calls}
              </span>
              <span className="inline-flex items-center gap-1">
                <Coins className="w-3 h-3" aria-hidden="true" />
                {formatCompactNumber(session.metrics.tokens_used)}
              </span>
              {session.metrics.estimated_cost_cents != null &&
                session.metrics.estimated_cost_cents > 0 && (
                  <span className="text-gray-400">
                    ${(session.metrics.estimated_cost_cents / 100).toFixed(2)}
                  </span>
                )}
              {/* Uptime for running/paused agents */}
              {(isRunning || isPaused) && session.metrics.uptime_seconds > 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-400/70">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {formatUptime(session.metrics.uptime_seconds)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-500/80">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {session.started_at
                    ? formatDistanceToNow(new Date(session.started_at), { addSuffix: false })
                    : formatDistanceToNow(new Date(session.created_at), { addSuffix: false })}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Hover actions */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
            {canStart && (
              <button
                type="button"
                onClick={handleStart}
                className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                title="Start agent"
                aria-label="Start agent"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {canStop && (
              <button
                type="button"
                onClick={handleStop}
                className="p-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                title="Stop agent"
                aria-label="Stop agent"
              >
                <Square className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-slate-700/60 text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Copy session data"
              aria-label="Copy session data"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleExportSummary}
              className="p-1.5 rounded-lg hover:bg-slate-700/60 text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Export run summary"
              aria-label="Export run summary"
            >
              <BarChart3 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <ChevronRight
            className="w-4 h-4 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all duration-200 pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
    </ContextMenu>
  );
});
