import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { LineChart, BarChart, DonutChart, StatCard } from '../components/AnalyticsChart';
import { SkeletonCard } from '../components/Skeleton';
import {
  Bot,
  Zap,
  Clock,
  Activity,
  TrendingUp,
  AlertTriangle,
  Wrench,
  MessageSquare,
} from 'lucide-react';
import { format, subDays, eachDayOfInterval, differenceInDays } from 'date-fns';
import { requireTenantId } from '../lib/auth-guards';
import type { AgentSession } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { DateRangePicker } from '../components/DateRangePicker';
import { useState } from 'react';

export default function Analytics() {
  usePageTitle('Analytics');
  const { tenant, currentBrand } = useAuthStore();
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 6),
    end: new Date(),
  });

  const { data: sessions = [], isLoading } = useQuery<AgentSession[]>({
    queryKey: queryKeys.sessions.list(tenant?.id, currentBrand?.id),
    queryFn: () => agentApi.listSessions(requireTenantId(tenant), currentBrand?.id),
    enabled: !!tenant?.id,
  });

  // Calculate analytics data
  const analytics = useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalAgents: 0,
        runningAgents: 0,
        totalTokens: 0,
        totalToolCalls: 0,
        totalLoops: 0,
        totalErrors: 0,
        avgTokensPerSession: 0,
        avgToolCallsPerSession: 0,
        statusDistribution: [],
        tokensByDay: [],
        toolCallsByAgentType: [],
        performanceByAgent: [],
      };
    }

    const runningAgents = sessions.filter(
      (s) => s.status === 'running' || s.status === 'paused'
    ).length;

    const totalTokens = sessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0);
    const totalToolCalls = sessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0);
    const totalLoops = sessions.reduce((acc, s) => acc + s.metrics.loop_count, 0);
    const totalErrors = sessions.reduce((acc, s) => acc + s.metrics.errors, 0);

    // Status distribution for donut chart
    const statusCounts = sessions.reduce(
      (acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const statusColors: Record<string, string> = {
      running: '#22c55e',
      paused: '#f59e0b',
      stopped: '#6b7280',
      failed: '#ef4444',
      starting: '#3b82f6',
      stopping: '#8b5cf6',
    };

    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      color: statusColors[status] || '#6b7280',
    }));

    // Tokens by day (dynamic date range)
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    const rangeDays = differenceInDays(dateRange.end, dateRange.start) + 1;
    const labelFormat = rangeDays <= 7 ? 'EEE' : 'MMM d';
    const tokensByDay = days.map((day) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const dayTokens = sessions
        .filter((s) => {
          const created = new Date(s.created_at);
          return created >= dayStart && created <= dayEnd;
        })
        .reduce((acc, s) => acc + s.metrics.tokens_used, 0);

      return {
        label: format(day, labelFormat),
        value: dayTokens,
      };
    });

    const agentTypes = [...new Set(sessions.map((s) => s.agent_type))];
    const toolCallsByAgentType = agentTypes
      .map((type) => {
        const typeSessions = sessions.filter((s) => s.agent_type === type);
        return {
          label: type.charAt(0).toUpperCase() + type.slice(1),
          value: typeSessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0),
        };
      })
      .sort((a, b) => b.value - a.value);

    // Performance by agent type
    const performanceByAgent = agentTypes.map((type) => {
      const typeSessions = sessions.filter((s) => s.agent_type === type);
      return {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        value: typeSessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0),
      };
    });

    return {
      totalAgents: sessions.length,
      runningAgents,
      totalTokens,
      totalToolCalls,
      totalLoops,
      totalErrors,
      avgTokensPerSession: sessions.length > 0 ? Math.round(totalTokens / sessions.length) : 0,
      avgToolCallsPerSession:
        sessions.length > 0 ? Math.round(totalToolCalls / sessions.length) : 0,
      statusDistribution,
      tokensByDay,
      toolCallsByAgentType,
      performanceByAgent,
    };
  }, [sessions, dateRange]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-400 mt-1">Monitor your agent performance and usage metrics</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Agents" value={analytics.totalAgents} icon={Bot} color="blue" />
        <StatCard
          label="Running Now"
          value={analytics.runningAgents}
          icon={Activity}
          color="green"
          change={analytics.runningAgents > 0 ? 100 : 0}
          changeLabel="active"
        />
        <StatCard label="Total Tokens" value={analytics.totalTokens} icon={Zap} color="amber" />
        <StatCard
          label="Tool Calls"
          value={analytics.totalToolCalls}
          icon={Wrench}
          color="purple"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Loops" value={analytics.totalLoops} icon={TrendingUp} color="blue" />
        <StatCard
          label="Total Errors"
          value={analytics.totalErrors}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          label="Avg Tokens/Session"
          value={analytics.avgTokensPerSession}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Avg Tools/Session"
          value={analytics.avgToolCallsPerSession}
          icon={MessageSquare}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Usage Over Time */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Token Usage Over Time</h3>
          <LineChart data={analytics.tokensByDay} height={200} color="#0ea5e9" showArea />
        </div>

        {/* Tool Calls Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Tool Calls by Agent Type</h3>
          <BarChart data={analytics.toolCallsByAgentType} height={200} color="#a855f7" />
        </div>

        {/* Agent Status Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Agent Status Distribution</h3>
          <DonutChart data={analytics.statusDistribution} size={180} thickness={30} showLegend />
        </div>

        {/* Performance by Agent Type */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Tokens by Agent Type</h3>
          <BarChart data={analytics.performanceByAgent} height={200} color="#22c55e" />
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Agent Performance Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Agent Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Tokens Used
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Tool Calls
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Avg Loops
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[...new Set(sessions.map((s) => s.agent_type))].map((type) => {
                const typeSessions = sessions.filter((s) => s.agent_type === type);
                const totalTokens = typeSessions.reduce((acc, s) => acc + s.metrics.tokens_used, 0);
                const totalTools = typeSessions.reduce((acc, s) => acc + s.metrics.tool_calls, 0);
                const avgLoops = Math.round(
                  typeSessions.reduce((acc, s) => acc + s.metrics.loop_count, 0) /
                    typeSessions.length
                );

                return (
                  <tr key={type} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                      {typeSessions.length}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                      {totalTokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                      {totalTools.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400">{avgLoops}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
