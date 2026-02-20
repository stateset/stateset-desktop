import type { AgentSession, AgentSessionStatus } from '../../../types';
import { memo } from 'react';
import { Bot, Play, Square, ChevronRight, BarChart3, AlertTriangle, Copy } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ContextMenu } from '../../../components/ContextMenu';
import { TagBadge } from '../../../components/TagBadge';

interface DashboardSessionRowProps {
  session: AgentSession;
  onStart: () => void;
  onStop: () => void;
  onClick: () => void;
  onCopy: () => void;
  onExportSummary: () => void;
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

  function getStatusColor(status: AgentSessionStatus): string {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'paused':
        return 'bg-amber-500';
      case 'starting':
      case 'stopping':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
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
      onClick: onClick,
    },
    ...(canStart
      ? [
          {
            id: 'start',
            label: 'Start Agent',
            icon: Play,
            onClick: onStart,
          },
        ]
      : []),
    ...(canStop
      ? [
          {
            id: 'stop',
            label: 'Stop Agent',
            icon: Square,
            onClick: onStop,
            danger: true,
          },
        ]
      : []),
    {
      id: 'copy',
      label: 'Copy Session Data',
      icon: Copy,
      onClick: onCopy,
      divider: true,
    },
    {
      id: 'summary',
      label: 'Export Run Summary',
      icon: BarChart3,
      onClick: onExportSummary,
    },
  ];

  return (
    <ContextMenu items={contextMenuItems}>
      <div className="relative group hover:bg-gray-800/50 transition-colors">
        <button
          type="button"
          className="w-full flex items-center gap-4 px-4 py-3 pr-36 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset focus-visible:ring-offset-1"
          onClick={onClick}
          aria-label={`${sessionTitle}, status: ${getStatusText(session.status)}, ${session.metrics.loop_count} loops, ${session.metrics.tokens_used} tokens`}
        >
          {/* Status indicator */}
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
              <Bot className="w-5 h-5 text-gray-400" aria-hidden="true" />
            </div>
            <div
              className={clsx(
                'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900',
                getStatusColor(session.status),
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{sessionTitle}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs rounded-full',
                  session.status === 'running' && 'bg-green-900/50 text-green-400',
                  session.status === 'paused' && 'bg-amber-900/50 text-amber-400',
                  session.status === 'stopped' && 'bg-gray-800 text-gray-400',
                  session.status === 'failed' && 'bg-red-900/50 text-red-400'
                )}
              >
                {getStatusText(session.status)}
              </span>
              {session.status === 'failed' && (
                <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
              )}
              {session.tags &&
                session.tags.length > 0 &&
                session.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
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
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
            {canStart && (
              <button
                type="button"
                onClick={onStart}
                className="p-2 rounded-lg hover:bg-green-900/30 text-green-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50 focus-visible:ring-offset-1"
                title="Start agent"
                aria-label="Start agent"
              >
                <Play className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            {canStop && (
              <button
                type="button"
                onClick={onStop}
                className="p-2 rounded-lg hover:bg-red-900/30 text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:ring-offset-1"
                title="Stop agent"
                aria-label="Stop agent"
              >
                <Square className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onCopy}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              title="Copy session data"
              aria-label="Copy session data"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onExportSummary}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              title="Export run summary"
              aria-label="Export run summary"
            >
              <BarChart3 className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <ChevronRight
            className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
    </ContextMenu>
  );
});
