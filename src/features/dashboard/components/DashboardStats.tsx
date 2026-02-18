import { useMemo, memo } from 'react';
import type { AgentSession } from '../../../types';
import { Activity, TrendingUp, Zap, Clock } from 'lucide-react';
import { Sparkline, SparklineBar } from '../../../components/Sparkline';

interface DashboardStatsProps {
  sessions: AgentSession[];
}

export const DashboardStats = memo(function DashboardStats({ sessions }: DashboardStatsProps) {
  const runningCount = sessions.filter(
    (s) => s.status === 'running' || s.status === 'paused'
  ).length;
  const stoppedCount = sessions.filter(
    (s) => s.status === 'stopped' || s.status === 'failed'
  ).length;
  const totalTokens = sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0);
  const totalToolCalls = sessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0);
  const totalLoops = sessions.reduce((acc, s) => acc + s.metrics.loop_count, 0);

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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Running Agents */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{runningCount}</p>
              <p className="text-sm text-gray-400">Running</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{stoppedCount} stopped</p>
            <p className="text-xs text-gray-500">{sessions.length} total</p>
          </div>
        </div>
      </div>

      {/* Total Loops */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalLoops.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Total Loops</p>
            </div>
          </div>
        </div>
        {sparklineData.loops.length > 1 && (
          <Sparkline data={sparklineData.loops} color="#3B82F6" height={24} width={140} />
        )}
      </div>

      {/* Tool Calls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalToolCalls.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Tool Calls</p>
            </div>
          </div>
        </div>
        {sparklineData.tools.length > 1 && (
          <SparklineBar data={sparklineData.tools} color="#A855F7" height={24} width={140} />
        )}
      </div>

      {/* Tokens Used */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-900/50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalTokens.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Tokens Used</p>
            </div>
          </div>
        </div>
        {sparklineData.tokens.length > 1 && (
          <Sparkline data={sparklineData.tokens} color="#F59E0B" height={24} width={140} />
        )}
      </div>
    </div>
  );
});
