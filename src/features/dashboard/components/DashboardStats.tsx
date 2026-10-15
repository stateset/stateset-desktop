import { useMemo, memo } from 'react';
import type { AgentSession } from '../../../types';
import { Activity, Repeat2, Zap, Coins } from 'lucide-react';
import { SparklineBar } from '../../../components/Sparkline';
import { Skeleton } from '../../../components/Skeleton';
import clsx from 'clsx';

interface DashboardStatsProps {
  sessions: AgentSession[];
  isLoading?: boolean;
  activeFilter?: string | null;
  onStatClick?: (filter: string) => void;
}

function formatMetric(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

type MetricKey = 'loop_count' | 'tool_calls' | 'tokens_used';

/** Snapshots from separate sessions are discrete comparisons, not a time series. */
function SessionComparison({
  sessions,
  metric,
  label,
}: {
  sessions: AgentSession[];
  metric: MetricKey;
  label: string;
}) {
  if (sessions.length === 0)
    return <p className="dashboard-stat-caption mt-3 text-[11px]">No session data</p>;
  const descriptions = sessions.map(
    (session) =>
      `${session.name?.trim() || session.id}: ${session.metrics[metric].toLocaleString()}`
  );
  return (
    <figure
      className="mt-3"
      title="Most recently created sessions, ordered oldest to newest. Each bar starts at zero."
    >
      <figcaption className="dashboard-stat-caption text-[11px] mb-1">
        Per session · last {sessions.length}
      </figcaption>
      <div aria-hidden="true">
        <SparklineBar
          data={sessions.map((session) => session.metrics[metric])}
          labels={descriptions}
          color="var(--ui-muted)"
          height={24}
          width={300}
          gap={4}
          responsive
        />
      </div>
      <ol className="sr-only" aria-label={`${label} by session, oldest first`}>
        {sessions.map((session, index) => (
          <li key={session.id}>{descriptions[index]}</li>
        ))}
      </ol>
    </figure>
  );
}

/** Decorative share of sessions currently running or paused. */
function ProgressRing({ value, max }: { value: number; max: number }) {
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <svg width={28} height={28} className="-rotate-90" aria-hidden="true" focusable="false">
      <circle
        cx={14}
        cy={14}
        r={radius}
        fill="none"
        className="stroke-emerald-500/10"
        strokeWidth={2}
      />
      <circle
        cx={14}
        cy={14}
        r={radius}
        fill="none"
        className="stroke-emerald-500"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
      />
    </svg>
  );
}

export const DashboardStats = memo(function DashboardStats({
  sessions,
  isLoading,
  activeFilter,
  onStatClick,
}: DashboardStatsProps) {
  const runningCount = sessions.filter(
    (session) => session.status === 'running' || session.status === 'paused'
  ).length;
  const totalTokens = sessions.reduce((sum, session) => sum + session.metrics.tokens_used, 0);
  const totalTools = sessions.reduce((sum, session) => sum + session.metrics.tool_calls, 0);
  const totalLoops = sessions.reduce((sum, session) => sum + session.metrics.loop_count, 0);
  const totalCostCents = sessions.reduce(
    (sum, session) => sum + (session.metrics.estimated_cost_cents || 0),
    0
  );
  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id)
        )
        .slice(0, 10)
        .reverse(),
    [sessions]
  );

  if (isLoading)
    return (
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        role="status"
        aria-label="Loading session metrics"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="dashboard-stat rounded-xl border p-5" aria-hidden="true">
            <Skeleton width={88} height={14} className="mb-4" shimmer />
            <Skeleton width={80} height={28} className="mb-4" shimmer />
            <Skeleton width="100%" height={38} shimmer />
          </div>
        ))}
      </div>
    );

  const cards = [
    {
      key: 'running',
      label: 'Active',
      value: runningCount,
      display: String(runningCount),
      icon: Activity,
      metric: null,
      subtitle: `${sessions.length} total`,
      tooltip: 'Active agent sessions currently running or paused. Click to filter.',
    },
    {
      key: 'loops',
      label: 'Total Loops',
      value: totalLoops,
      display: formatMetric(totalLoops),
      icon: Repeat2,
      metric: 'loop_count',
      subtitle: null,
      tooltip: `${totalLoops.toLocaleString()} iteration cycles across all ${sessions.length} sessions.`,
    },
    {
      key: 'tools',
      label: 'Tool Calls',
      value: totalTools,
      display: formatMetric(totalTools),
      icon: Zap,
      metric: 'tool_calls',
      subtitle: null,
      tooltip: `${totalTools.toLocaleString()} tool calls across all ${sessions.length} sessions.`,
    },
    {
      key: 'tokens',
      label: 'Tokens Used',
      value: totalTokens,
      display: formatMetric(totalTokens),
      icon: Coins,
      metric: 'tokens_used',
      subtitle: totalCostCents > 0 ? `~$${(totalCostCents / 100).toFixed(2)}` : null,
      tooltip: `${totalTokens.toLocaleString()} tokens across all ${sessions.length} sessions.`,
    },
  ] satisfies Array<{
    key: string;
    label: string;
    value: number;
    display: string;
    icon: typeof Activity;
    metric: MetricKey | null;
    subtitle: string | null;
    tooltip: string;
  }>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isClickable = card.key === 'running' && !!onStatClick;
        const isActive = activeFilter === 'running';
        return (
          <div
            key={card.key}
            role={isClickable ? 'button' : 'group'}
            tabIndex={isClickable ? 0 : undefined}
            title={card.tooltip}
            onClick={isClickable ? () => onStatClick('running') : undefined}
            onKeyDown={
              isClickable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onStatClick('running');
                    }
                  }
                : undefined
            }
            aria-pressed={isClickable ? isActive : undefined}
            aria-label={
              isClickable
                ? `${card.label}: ${card.value}. Click to ${isActive ? 'clear' : 'filter by running or paused'}`
                : `${card.label}: ${card.value.toLocaleString()}`
            }
            className={clsx(
              'dashboard-stat rounded-xl border p-5 transition-colors',
              isClickable && 'cursor-pointer'
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="dashboard-stat-caption text-xs font-medium">{card.label}</p>
              {card.key === 'running' ? (
                <div className="relative shrink-0">
                  <ProgressRing value={runningCount} max={sessions.length} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 ui-positive" aria-hidden="true" />
                  </div>
                </div>
              ) : (
                <div className="dashboard-stat-icon w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
              )}
            </div>
            <p
              className="metric-value text-[1.75rem] font-semibold tracking-tight leading-none tabular-nums"
              title={card.value.toLocaleString()}
            >
              {card.display}
            </p>
            <p className="dashboard-stat-caption text-[11px] mt-1">
              {card.key === 'running' ? card.subtitle : 'All sessions'}
              {card.key !== 'running' && card.subtitle && (
                <span className="ml-2">{card.subtitle}</span>
              )}
            </p>
            {card.metric && (
              <SessionComparison
                sessions={recentSessions}
                metric={card.metric}
                label={card.label}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
