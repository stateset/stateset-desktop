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
  return (
    <div className="w-72 border-l border-gray-800 p-4 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Session Metrics
      </h2>

      <div className="space-y-4">
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
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Run Summary
          </h3>
          <button
            type="button"
            onClick={onExportSummary}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            title="Export run summary"
            aria-label="Export run summary"
          >
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <SummaryRow label="Status" value={currentStatus || 'unknown'} />
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
        <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-sm text-red-400">{streamError}</p>
        </div>
      )}

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
  blue: 'bg-blue-900/30 text-blue-400',
  amber: 'bg-amber-900/30 text-amber-400',
  purple: 'bg-purple-900/30 text-purple-400',
  green: 'bg-green-900/30 text-green-400',
  red: 'bg-red-900/30 text-red-400',
} as const;

function MetricCard({ icon: Icon, label, value, color }: MetricCardProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
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
          <p className="text-sm text-gray-400">{label}</p>
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
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200 text-right">{value}</span>
    </div>
  );
}
