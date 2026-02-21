import type { AgentSession, AgentSessionStatus } from '../../../types';
import { memo, useCallback } from 'react';
import { Bot, Play, Square, ChevronRight, BarChart3, AlertTriangle, Copy } from 'lucide-react';
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

  const handleStart = useCallback(() => onStart(session.id), [onStart, session.id]);
  const handleStop = useCallback(() => onStop(session.id), [onStop, session.id]);
  const handleClick = useCallback(() => onClick(session.id), [onClick, session.id]);
  const handleCopy = useCallback(() => onCopy(session), [onCopy, session]);
  const handleExportSummary = useCallback(
    () => onExportSummary(session),
    [onExportSummary, session]
  );

  function getStatusColor(status: AgentSessionStatus): string {
    switch (status) {
      case 'running':
        return 'bg-emerald-500';
      case 'paused':
        return 'bg-amber-500';
      case 'starting':
      case 'stopping':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-rose-500';
      default:
        return 'bg-slate-500';
    }
  }

  function getStatusText(status: AgentSessionStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  const contextMenuItems = [
    {
      id: 'view',
      label: 'View Details',
      icon: ChevronRight,
      onClick: handleClick,
    },
    ...(canStart
      ? [
          {
            id: 'start',
            label: 'Start Agent',
            icon: Play,
            onClick: handleStart,
          },
        ]
      : []),
    ...(canStop
      ? [
          {
            id: 'stop',
            label: 'Stop Agent',
            icon: Square,
            onClick: handleStop,
            danger: true,
          },
        ]
      : []),
    {
      id: 'copy',
      label: 'Copy Session Data',
      icon: Copy,
      onClick: handleCopy,
      divider: true,
    },
    {
      id: 'summary',
      label: 'Export Run Summary',
      icon: BarChart3,
      onClick: handleExportSummary,
    },
  ];

  return (
    <ContextMenu items={contextMenuItems}>
      <div className="relative group hover:bg-slate-800/40 transition-colors">
        <button
          type="button"
          className="w-full flex items-center gap-5 px-5 py-4 pr-40 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset"
          onClick={handleClick}
          aria-label={`${sessionTitle}, status: ${getStatusText(session.status)}, ${session.metrics.loop_count} loops, ${session.metrics.tokens_used} tokens`}
        >
          {/* Status indicator */}
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center shadow-inner backdrop-blur-sm">
              <Bot className="w-6 h-6 text-gray-400" aria-hidden="true" />
            </div>
            <div
              className={clsx(
                'absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[2.5px] border-slate-900 shadow-sm',
                getStatusColor(session.status),
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-gray-200 truncate">{sessionTitle}</span>
              <span
                className={clsx(
                  'px-2.5 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded-md border backdrop-blur-sm shadow-sm',
                  session.status === 'running' &&
                    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                  session.status === 'paused' &&
                    'bg-amber-500/15 text-amber-300 border-amber-500/30',
                  session.status === 'stopped' &&
                    'bg-slate-800/60 text-slate-300 border-slate-700/60',
                  session.status === 'failed' && 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                )}
              >
                {getStatusText(session.status)}
              </span>
              {session.status === 'failed' && (
                <AlertTriangle className="w-4 h-4 text-rose-400" aria-hidden="true" />
              )}
              {session.tags &&
                session.tags.length > 0 &&
                session.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs font-medium text-gray-500">
              {session.name?.trim() && <span>{agentTypeLabel}</span>}
              <span>Loop #{session.metrics.loop_count}</span>
              <span>{session.metrics.tool_calls} tools</span>
              <span>{session.metrics.tokens_used.toLocaleString()} tokens</span>
              <span>
                {session.started_at
                  ? `Started ${formatDistanceToNow(new Date(session.started_at))} ago`
                  : `Created ${formatDistanceToNow(new Date(session.created_at))} ago`}
              </span>
            </div>
          </div>
        </button>

        {/* Actions */}
        <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <div className="flex items-center gap-2 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
            {canStart && (
              <button
                type="button"
                onClick={handleStart}
                className="p-2 rounded-xl hover:bg-emerald-500/15 text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                title="Start agent"
                aria-label="Start agent"
              >
                <Play className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            {canStop && (
              <button
                type="button"
                onClick={handleStop}
                className="p-2 rounded-xl hover:bg-rose-500/15 text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                title="Stop agent"
                aria-label="Stop agent"
              >
                <Square className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 rounded-xl hover:bg-slate-800/80 text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Copy session data"
              aria-label="Copy session data"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleExportSummary}
              className="p-2 rounded-xl hover:bg-slate-800/80 text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Export run summary"
              aria-label="Export run summary"
            >
              <BarChart3 className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <ChevronRight
            className="w-5 h-5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all duration-200 pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
    </ContextMenu>
  );
});
