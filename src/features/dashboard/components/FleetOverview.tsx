import { getSessionCounts, getFleetInsights } from '../utils/sessionFilters';
import { formatUptime } from '../utils/format';
import type { AgentSession } from '../../../types';

interface FleetOverviewProps {
  sessions: AgentSession[];
}

/** Sidebar card: status breakdown, fleet health bar, and aggregate insights. */
export function FleetOverview({ sessions }: FleetOverviewProps) {
  const { runningCount, stoppedCount, failedCount } = getSessionCounts(sessions);
  const {
    totalUptimeSeconds: totalUptime,
    totalCostCents: totalCost,
    avgTokensPerAgent,
    totalErrors,
  } = getFleetInsights(sessions);

  return (
    <div className="relative bg-slate-900/40 border border-slate-700/40 rounded-2xl overflow-hidden backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/50">
        <h3 className="text-sm font-bold text-gray-300 tracking-tight">Fleet Overview</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between group">
          <span className="flex items-center gap-2.5 text-sm text-gray-400">
            <span className="relative flex h-2 w-2">
              {runningCount > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Running
          </span>
          <span className="text-sm font-bold text-gray-200 tabular-nums">{runningCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-sm text-gray-400">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Stopped
          </span>
          <span className="text-sm font-bold text-gray-200 tabular-nums">
            {stoppedCount - failedCount}
          </span>
        </div>
        {failedCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Failed
            </span>
            <span className="text-sm font-bold text-rose-300 tabular-nums">{failedCount}</span>
          </div>
        )}

        {/* Fleet health bar */}
        {sessions.length > 0 && (
          <div className="pt-2">
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
              {runningCount > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${(runningCount / sessions.length) * 100}%`,
                  }}
                />
              )}
              {stoppedCount - failedCount > 0 && (
                <div
                  className="h-full bg-slate-500 transition-all duration-500"
                  style={{
                    width: `${((stoppedCount - failedCount) / sessions.length) * 100}%`,
                  }}
                />
              )}
              {failedCount > 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${(failedCount / sessions.length) * 100}%`,
                  }}
                />
              )}
            </div>
            <p className="text-[11px] text-gray-600 mt-1.5 font-medium">
              {sessions.length} agent{sessions.length !== 1 ? 's' : ''} total
            </p>
          </div>
        )}

        {/* Fleet insights */}
        {sessions.length > 0 && (
          <div className="pt-3 mt-3 border-t border-slate-700/40 space-y-2">
            {totalUptime > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Total Uptime</span>
                <span className="font-semibold text-gray-300 tabular-nums">
                  {formatUptime(totalUptime)}
                </span>
              </div>
            )}
            {totalCost > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Est. Cost</span>
                <span className="font-semibold text-gray-300 tabular-nums">
                  ${(totalCost / 100).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-gray-500">Avg Tokens / Agent</span>
              <span className="font-semibold text-gray-300 tabular-nums">
                {avgTokensPerAgent >= 1_000
                  ? `${(avgTokensPerAgent / 1_000).toFixed(1)}K`
                  : avgTokensPerAgent.toLocaleString()}
              </span>
            </div>
            {totalErrors > 0 && (
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Total Errors</span>
                <span className="font-semibold text-amber-400 tabular-nums">{totalErrors}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
