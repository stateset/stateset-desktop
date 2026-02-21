import { useMemo, memo } from 'react';
import type { AgentSession } from '../../../types';
import { Activity, TrendingUp, Zap, Clock } from 'lucide-react';
import { Sparkline, SparklineBar } from '../../../components/Sparkline';
import { Skeleton } from '../../../components/Skeleton';
import { useCountUp } from '../../../hooks/useCountUp';

interface DashboardStatsProps {
  sessions: AgentSession[];
  isLoading?: boolean;
}

export const DashboardStats = memo(function DashboardStats({
  sessions,
  isLoading,
}: DashboardStatsProps) {
  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused'
  ).length;
  const stoppedCount = sessions.filter(
    (s) => s.status === 'stopped' || s.status === 'failed'
  ).length;
  const totalTokens = sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0);
  const totalToolCalls = sessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0);
  const totalLoops = sessions.reduce((acc, s) => acc + s.metrics.loop_count, 0);

  const animatedRunning = useCountUp({ end: runningCount, duration: 400 });
  const animatedLoops = useCountUp({ end: totalLoops });
  const animatedToolCalls = useCountUp({ end: totalToolCalls });
  const animatedTokens = useCountUp({ end: totalTokens });

  const sparklineData = useMemo(() => {
    const sortedSessions = [...sessions]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    return {
      tokens: sortedSessions.map((s) => s.metrics.tokens_used).reverse(),
      tools: sortedSessions.map((s) => s.metrics.tool_calls).reverse(),
      loops: sortedSessions.map((s) => s.metrics.loop_count).reverse(),
    };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm"
          >
            <div className="flex items-center gap-4">
              <Skeleton variant="rectangular" width={48} height={48} className="rounded-xl" />
              <div className="space-y-2">
                <Skeleton width={64} height={28} />
                <Skeleton width={80} height={14} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
      {/* Running Agents */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm hover:bg-slate-900/60 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/50 transition-all duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center border border-emerald-500/25 shadow-inner shadow-emerald-500/10">
              <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-200">{animatedRunning}</p>
              <p className="text-sm font-medium text-gray-400">Running</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">{stoppedCount} stopped</p>
            <p className="text-xs font-medium text-gray-500">{sessions.length} total</p>
          </div>
        </div>
      </div>

      {/* Total Loops */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm hover:bg-slate-900/60 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/50 transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center border border-blue-500/25 shadow-inner shadow-blue-500/10">
              <TrendingUp className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-200">{animatedLoops}</p>
              <p className="text-sm font-medium text-gray-400">Total Loops</p>
            </div>
          </div>
        </div>
        {sparklineData.loops.length > 1 && (
          <div className="animate-fade-in">
            <Sparkline data={sparklineData.loops} color="#3B82F6" height={28} width={140} />
          </div>
        )}
      </div>

      {/* Tool Calls */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm hover:bg-slate-900/60 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/50 transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center border border-purple-500/25 shadow-inner shadow-purple-500/10">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-200">{animatedToolCalls}</p>
              <p className="text-sm font-medium text-gray-400">Tool Calls</p>
            </div>
          </div>
        </div>
        {sparklineData.tools.length > 1 && (
          <div className="animate-fade-in">
            <SparklineBar data={sparklineData.tools} color="#A855F7" height={28} width={140} />
          </div>
        )}
      </div>

      {/* Tokens Used */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm shadow-sm hover:bg-slate-900/60 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-600/50 transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center border border-amber-500/25 shadow-inner shadow-amber-500/10">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-200">{animatedTokens}</p>
              <p className="text-sm font-medium text-gray-400">Tokens Used</p>
            </div>
          </div>
        </div>
        {sparklineData.tokens.length > 1 && (
          <div className="animate-fade-in">
            <Sparkline data={sparklineData.tokens} color="#F59E0B" height={28} width={140} />
          </div>
        )}
      </div>
    </div>
  );
});
