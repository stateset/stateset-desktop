import { memo, type ReactNode } from 'react';
import {
  Hash,
  Zap,
  Wrench,
  AlertTriangle,
  BarChart3,
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { LogsViewer, type LogEntry } from '../../../components/LogsViewer';
import type { AgentSession, AgentSessionMetrics, AgentSessionStatus } from '../../../types';
import { formatDuration } from '../utils';

interface MetricsPanelProps {
  session: AgentSession;
  currentStatus: AgentSessionStatus | string | null;
  currentMetrics: AgentSessionMetrics | null;
  streamError: string | null;
  showLogs: boolean;
  logs: LogEntry[];
  onClearLogs: () => void;
  onExportSummary: () => void;
}

export const MetricsPanel = memo(function MetricsPanel({
  session,
  currentStatus,
  currentMetrics,
  streamError,
  showLogs,
  logs,
  onClearLogs,
  onExportSummary,
}: MetricsPanelProps) {
  const resolvedStatus = currentStatus || session.status || 'stopped';
  const statusLabel =
    resolvedStatus === 'running'
      ? 'Live'
      : resolvedStatus === 'paused'
        ? 'Paused'
        : resolvedStatus === 'starting'
          ? 'Starting'
          : resolvedStatus === 'stopping'
            ? 'Stopping'
            : resolvedStatus === 'failed'
              ? 'Failed'
              : 'Ready';
  const statusHint =
    resolvedStatus === 'running'
      ? 'Agent is actively processing messages'
      : resolvedStatus === 'paused'
        ? 'Agent is waiting for resume'
        : resolvedStatus === 'starting'
          ? 'Booting new run cycle'
          : resolvedStatus === 'stopping'
            ? 'Shutting down safely'
            : resolvedStatus === 'failed'
              ? 'Connection or runtime issue detected'
              : 'Session is ready';
  const statusStyle =
    resolvedStatus === 'running'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
      : resolvedStatus === 'paused'
        ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
        : resolvedStatus === 'starting' || resolvedStatus === 'stopping'
          ? 'bg-sky-500/20 text-sky-300 border-sky-400/30'
          : resolvedStatus === 'failed'
            ? 'bg-rose-600/20 text-rose-200 border-rose-500/30'
            : 'bg-slate-700/35 text-slate-300 border-slate-500/30';

  return (
    <div
      className="w-72 border-l border-slate-700/45 p-4 overflow-y-auto bg-slate-950/30 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Session metrics"
    >
      <div className="space-y-2 mb-4">
        <div className="inline-flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
            Session Metrics
          </h2>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <p className="text-xs text-slate-500">
          {session.name?.trim() ? `${session.name} • ${session.agent_type}` : session.agent_type}
        </p>
      </div>

      <div className="space-y-3">
        <MetricCard
          icon={Hash}
          label="Loop Count"
          value={currentMetrics?.loop_count || 0}
          color="blue"
        />
        <MetricCard
          icon={Zap}
          label="Tokens Used"
          value={currentMetrics?.tokens_used || 0}
          color="amber"
        />
        <MetricCard
          icon={Wrench}
          label="Tool Calls"
          value={currentMetrics?.tool_calls || 0}
          color="purple"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Errors"
          value={currentMetrics?.errors || 0}
          color="red"
        />
        <MetricCard
          icon={DollarSign}
          label="Est. Cost"
          value={
            currentMetrics?.estimated_cost_cents != null
              ? `$${(currentMetrics.estimated_cost_cents / 100).toFixed(4)}`
              : '—'
          }
          color="green"
        />
        <MetricCard
          icon={ArrowDownCircle}
          label="Input Tokens"
          value={currentMetrics?.input_tokens?.toLocaleString() ?? '—'}
          color="blue"
        />
        <MetricCard
          icon={ArrowUpCircle}
          label="Output Tokens"
          value={currentMetrics?.output_tokens?.toLocaleString() ?? '—'}
          color="purple"
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Run Summary
          </h3>
          <button
            type="button"
            onClick={onExportSummary}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            title="Export run summary"
            aria-label="Export run summary"
          >
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <SummaryRow label="Status" value={resolvedStatus} />
          <SummaryRow
            label="Duration"
            value={formatDuration(currentMetrics?.uptime_seconds || 0)}
          />
          <SummaryRow label="Messages" value={currentMetrics?.messages_sent || 0} />
          <SummaryRow
            label="Started"
            value={session.started_at ? new Date(session.started_at).toLocaleString() : '—'}
          />
          <SummaryRow
            label="Updated"
            value={session.updated_at ? new Date(session.updated_at).toLocaleString() : '—'}
          />
        </div>
      </div>

      {streamError && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-red-700/60 bg-red-900/20 p-3"
        >
          <p className="text-sm text-red-300">{streamError}</p>
        </motion.div>
      )}

      <div className="mt-4 rounded-lg border border-slate-800/70 bg-slate-900/35 p-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Connection</div>
        <div
          className={clsx(
            'mt-2 rounded-lg border px-3 py-2 flex items-center justify-between gap-3',
            statusStyle
          )}
        >
          <p className="text-sm font-medium">{statusLabel}</p>
          <p className="text-xs opacity-90 max-w-36 text-right">{statusHint}</p>
        </div>
      </div>

      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 overflow-hidden"
          >
            <LogsViewer logs={logs} title="Agent Logs" maxHeight="300px" onClear={onClearLogs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ── Sub-components ────────────────────────────────────────────────────

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: 'blue' | 'amber' | 'purple' | 'green' | 'red';
}

const colorClasses = {
  blue: 'bg-gradient-to-br from-blue-900/40 to-blue-900/15 text-blue-400 border border-blue-500/15 shadow-inner shadow-blue-500/5',
  amber:
    'bg-gradient-to-br from-amber-900/40 to-amber-900/15 text-amber-400 border border-amber-500/15 shadow-inner shadow-amber-500/5',
  purple:
    'bg-gradient-to-br from-purple-900/40 to-purple-900/15 text-purple-400 border border-purple-500/15 shadow-inner shadow-purple-500/5',
  green:
    'bg-gradient-to-br from-green-900/40 to-green-900/15 text-green-400 border border-green-500/15 shadow-inner shadow-green-500/5',
  red: 'bg-gradient-to-br from-red-900/40 to-red-900/15 text-red-400 border border-red-500/15 shadow-inner shadow-red-500/5',
} as const;

function MetricCard({ icon: Icon, label, value, color }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/35 p-4 hover:bg-slate-900/50 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            colorClasses[color]
          )}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xl font-bold">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          <p className="text-sm text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: ReactNode;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );
}
