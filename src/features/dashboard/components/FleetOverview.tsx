import { getStatusBreakdown, getFleetInsights } from '../utils/sessionFilters';
import { formatUptime } from '../utils/format';
import type { AgentSession } from '../../../types';

interface FleetOverviewProps {
  sessions: AgentSession[];
}

/** Sidebar card: status breakdown, fleet health bar, and aggregate insights. */
export function FleetOverview({ sessions }: FleetOverviewProps) {
  const counts = getStatusBreakdown(sessions);
  const statuses = [
    { status: 'running', label: 'Running', color: 'bg-emerald-500' },
    { status: 'paused', label: 'Paused', color: 'bg-amber-500' },
    { status: 'starting', label: 'Starting', color: 'bg-sky-500' },
    { status: 'stopping', label: 'Stopping', color: 'bg-violet-500' },
    { status: 'stopped', label: 'Stopped', color: 'bg-slate-500' },
    { status: 'failed', label: 'Failed', color: 'bg-rose-500' },
  ] as const;
  const visibleStatuses = statuses.filter(
    ({ status }) => counts[status] > 0 || status === 'running' || status === 'stopped'
  );
  const {
    totalUptimeSeconds: totalUptime,
    totalCostCents: totalCost,
    avgTokensPerAgent,
    totalErrors,
  } = getFleetInsights(sessions);

  return (
    <div className="dashboard-fleet rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b dashboard-fleet-divider">
        <h3 className="text-sm font-semibold">Fleet Overview</h3>
      </div>
      <div className="p-4 space-y-3">
        <dl className="space-y-3" aria-label="Agent status counts">
          {visibleStatuses.map(({ status, label, color }) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <dt className="dashboard-stat-caption flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${color}`} aria-hidden="true" />
                {label}
              </dt>
              <dd
                className={`font-semibold tabular-nums ${status === 'failed' ? 'ui-negative' : ''}`}
              >
                {counts[status]}
              </dd>
            </div>
          ))}
        </dl>

        {sessions.length > 0 && (
          <div className="pt-2">
            <div className="h-1.5 rounded-full overflow-hidden flex" aria-hidden="true">
              {visibleStatuses.map(
                ({ status, color }) =>
                  counts[status] > 0 && (
                    <div
                      key={status}
                      className={`h-full ${color}`}
                      style={{ width: `${(counts[status] / sessions.length) * 100}%` }}
                    />
                  )
              )}
            </div>
            <p className="text-[11px] dashboard-stat-caption mt-1.5">
              {sessions.length} agent{sessions.length !== 1 ? 's' : ''} total
            </p>
          </div>
        )}

        {/* Fleet insights */}
        {sessions.length > 0 && (
          <div className="pt-3 mt-3 border-t dashboard-fleet-divider space-y-2">
            {totalUptime > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="dashboard-stat-caption">Total Uptime</span>
                <span className="font-semibold tabular-nums">{formatUptime(totalUptime)}</span>
              </div>
            )}
            {totalCost > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="dashboard-stat-caption">Est. Cost</span>
                <span className="font-semibold tabular-nums">${(totalCost / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[12px]">
              <span className="dashboard-stat-caption">Avg Tokens / Agent</span>
              <span className="font-semibold tabular-nums">
                {avgTokensPerAgent >= 1_000
                  ? `${(avgTokensPerAgent / 1_000).toFixed(1)}K`
                  : avgTokensPerAgent.toLocaleString()}
              </span>
            </div>
            {totalErrors > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="dashboard-stat-caption">Total Errors</span>
                <span className="font-semibold ui-warning tabular-nums">{totalErrors}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
