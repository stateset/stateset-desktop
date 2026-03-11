import { useMemo, memo } from 'react';
import type { AgentSession } from '../../../types';
import { Activity, TrendingUp, Zap, Coins, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Sparkline, SparklineBar } from '../../../components/Sparkline';
import { Skeleton } from '../../../components/Skeleton';
import { useCountUp } from '../../../hooks/useCountUp';
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

function getTrend(data: number[]): { direction: 'up' | 'down' | 'flat'; pct: number } {
  if (data.length < 4) return { direction: 'flat', pct: 0 };
  const mid = Math.floor(data.length / 2);
  const first = data.slice(0, mid);
  const second = data.slice(mid);
  const avg1 = first.reduce((a, b) => a + b, 0) / first.length;
  const avg2 = second.reduce((a, b) => a + b, 0) / second.length;
  if (avg1 === 0) return { direction: avg2 > 0 ? 'up' : 'flat', pct: 0 };
  const change = ((avg2 - avg1) / avg1) * 100;
  if (Math.abs(change) < 5) return { direction: 'flat', pct: 0 };
  return { direction: change > 0 ? 'up' : 'down', pct: Math.round(Math.abs(change)) };
}

const colorStyles = {
  emerald: {
    accent: 'from-emerald-500/0 via-emerald-400 to-emerald-500/0',
    iconBg: 'from-emerald-500/20 to-emerald-600/5',
    iconBorder: 'border-emerald-500/20',
    iconText: 'text-emerald-400',
    hoverBorder: 'hover:border-emerald-500/30',
    activeBorder: 'border-emerald-500/40',
    glow: 'shadow-[0_0_30px_-6px_rgba(16,185,129,0.2)]',
    ring: 'stroke-emerald-500',
    ringBg: 'stroke-emerald-500/10',
  },
  blue: {
    accent: 'from-blue-500/0 via-blue-400 to-blue-500/0',
    iconBg: 'from-blue-500/20 to-blue-600/5',
    iconBorder: 'border-blue-500/20',
    iconText: 'text-blue-400',
    hoverBorder: 'hover:border-blue-500/30',
    activeBorder: 'border-blue-500/40',
    glow: '',
    ring: '',
    ringBg: '',
  },
  purple: {
    accent: 'from-purple-500/0 via-purple-400 to-purple-500/0',
    iconBg: 'from-purple-500/20 to-purple-600/5',
    iconBorder: 'border-purple-500/20',
    iconText: 'text-purple-400',
    hoverBorder: 'hover:border-purple-500/30',
    activeBorder: 'border-purple-500/40',
    glow: '',
    ring: '',
    ringBg: '',
  },
  amber: {
    accent: 'from-amber-500/0 via-amber-400 to-amber-500/0',
    iconBg: 'from-amber-500/20 to-amber-600/5',
    iconBorder: 'border-amber-500/20',
    iconText: 'text-amber-400',
    hoverBorder: 'hover:border-amber-500/30',
    activeBorder: 'border-amber-500/40',
    glow: '',
    ring: '',
    ringBg: '',
  },
} as const;

/** Circular progress ring for the Running card */
function ProgressRing({
  value,
  max,
  size = 44,
  strokeWidth = 3,
  colorClass,
  bgClass,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  colorClass: string;
  bgClass: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={bgClass}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={colorClass}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
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
    (s) => s.status === 'running' || s.status === 'paused'
  ).length;
  const totalTokens = sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0);
  const totalToolCalls = sessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0);
  const totalLoops = sessions.reduce((acc, s) => acc + s.metrics.loop_count, 0);
  const totalCostCents = sessions.reduce(
    (acc, s) => acc + (s.metrics.estimated_cost_cents || 0),
    0
  );

  const animatedRunning = useCountUp({ end: runningCount, duration: 400 });
  const animatedLoops = useCountUp({ end: totalLoops });
  const animatedToolCalls = useCountUp({ end: totalToolCalls });
  const animatedTokens = useCountUp({ end: totalTokens });

  const sparklineData = useMemo(() => {
    const sorted = [...sessions]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
    return {
      tokens: sorted.map((s) => s.metrics.tokens_used).reverse(),
      tools: sorted.map((s) => s.metrics.tool_calls).reverse(),
      loops: sorted.map((s) => s.metrics.loop_count).reverse(),
    };
  }, [sessions]);

  const loopsTrend = useMemo(() => getTrend(sparklineData.loops), [sparklineData.loops]);
  const toolsTrend = useMemo(() => getTrend(sparklineData.tools), [sparklineData.tools]);
  const tokensTrend = useMemo(() => getTrend(sparklineData.tokens), [sparklineData.tokens]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-700/30" />
            <div className="flex items-center justify-between mb-4">
              <Skeleton
                variant="rectangular"
                width={40}
                height={40}
                className="rounded-xl"
                shimmer
              />
              <Skeleton width={48} height={20} className="rounded-full" shimmer />
            </div>
            <Skeleton width={80} height={32} className="mb-1" shimmer />
            <Skeleton width={64} height={14} shimmer />
            <div className="mt-4">
              <Skeleton width="100%" height={40} className="rounded-lg" shimmer />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      key: 'running',
      label: 'Running',
      value: animatedRunning,
      displayValue: String(animatedRunning),
      subtitle: `${sessions.length} total`,
      icon: Activity,
      color: 'emerald' as const,
      sparkline: null as null,
      trend: null as null,
      glow: runningCount > 0,
      clickFilter: 'running',
      ring: { value: runningCount, max: sessions.length },
    },
    {
      key: 'loops',
      label: 'Total Loops',
      value: animatedLoops,
      displayValue: formatMetric(totalLoops),
      subtitle: null as string | null,
      icon: TrendingUp,
      color: 'blue' as const,
      sparkline: { type: 'line' as const, data: sparklineData.loops, color: '#3B82F6' },
      trend: loopsTrend,
      glow: false,
      clickFilter: null as string | null,
      ring: null as { value: number; max: number } | null,
    },
    {
      key: 'tools',
      label: 'Tool Calls',
      value: animatedToolCalls,
      displayValue: formatMetric(totalToolCalls),
      subtitle: null as string | null,
      icon: Zap,
      color: 'purple' as const,
      sparkline: { type: 'bar' as const, data: sparklineData.tools, color: '#A855F7' },
      trend: toolsTrend,
      glow: false,
      clickFilter: null as string | null,
      ring: null as { value: number; max: number } | null,
    },
    {
      key: 'tokens',
      label: 'Tokens Used',
      value: animatedTokens,
      displayValue: formatMetric(totalTokens),
      subtitle: totalCostCents > 0 ? `~$${(totalCostCents / 100).toFixed(2)}` : null,
      icon: Coins,
      color: 'amber' as const,
      sparkline: { type: 'line' as const, data: sparklineData.tokens, color: '#F59E0B' },
      trend: tokensTrend,
      glow: false,
      clickFilter: null as string | null,
      ring: null as { value: number; max: number } | null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const c = colorStyles[card.color];
        const isActive = card.clickFilter && activeFilter === card.clickFilter;
        const isClickable = !!card.clickFilter && !!onStatClick;

        return (
          <div
            key={card.key}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={isClickable ? () => onStatClick(card.clickFilter!) : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStatClick(card.clickFilter!);
                    }
                  }
                : undefined
            }
            className={clsx(
              'relative overflow-hidden rounded-2xl border p-5',
              'bg-gradient-to-b from-slate-900/80 to-slate-900/40 backdrop-blur-sm',
              isActive ? c.activeBorder : 'border-slate-700/40',
              !isActive && c.hoverBorder,
              'hover:-translate-y-1 hover:shadow-xl',
              'transition-all duration-300 ease-out group stat-card-hover',
              isClickable && 'cursor-pointer',
              isActive && 'ring-1 ring-emerald-500/20',
              card.glow && c.glow
            )}
            aria-label={
              isClickable
                ? `${card.label}: ${card.displayValue}. Click to ${isActive ? 'clear' : 'filter by ' + card.clickFilter}`
                : `${card.label}: ${card.displayValue}`
            }
          >
            {/* Top accent line */}
            <div
              className={clsx('absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r', c.accent)}
            />

            {/* Header: Icon/Ring + Trend */}
            <div className="flex items-center justify-between mb-3">
              {card.ring ? (
                <div className="relative">
                  <ProgressRing
                    value={card.ring.value}
                    max={card.ring.max}
                    colorClass={c.ring}
                    bgClass={c.ringBg}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className={clsx('w-4.5 h-4.5', c.iconText)} aria-hidden="true" />
                  </div>
                </div>
              ) : (
                <div
                  className={clsx(
                    'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center',
                    'border shadow-inner',
                    c.iconBg,
                    c.iconBorder
                  )}
                >
                  <Icon className={clsx('w-5 h-5', c.iconText)} aria-hidden="true" />
                </div>
              )}
              {card.trend && card.trend.direction !== 'flat' && (
                <div
                  className={clsx(
                    'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold',
                    card.trend.direction === 'up'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-rose-400 bg-rose-500/10'
                  )}
                >
                  {card.trend.direction === 'up' ? (
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
                  )}
                  {card.trend.pct}%
                </div>
              )}
            </div>

            {/* Value */}
            <p className="text-[1.75rem] font-extrabold text-white tracking-tight leading-none">
              {card.displayValue}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {card.label}
              </p>
              {card.subtitle && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-gray-600" />
                  <span className="text-[11px] font-medium text-gray-500">{card.subtitle}</span>
                </>
              )}
            </div>

            {/* Full-width sparkline */}
            {card.sparkline && card.sparkline.data.length > 1 && (
              <div className="mt-3 -mx-5 -mb-5 px-3 pt-1 pb-0 opacity-40 group-hover:opacity-80 transition-opacity duration-300">
                {card.sparkline.type === 'line' ? (
                  <Sparkline
                    data={card.sparkline.data}
                    color={card.sparkline.color}
                    height={44}
                    width={300}
                    responsive
                    showEndDot
                  />
                ) : (
                  <SparklineBar
                    data={card.sparkline.data}
                    color={card.sparkline.color}
                    height={44}
                    width={300}
                    responsive
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
