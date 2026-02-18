import { useMemo } from 'react';
import { Activity, Zap, MessageSquare, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { AgentSession } from '../types';

interface UsageAnalyticsProps {
  sessions: AgentSession[];
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  trend?: number;
}

function StatCard({ label, value, subtext, icon: Icon, color, trend }: StatCardProps) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-900/30',
    green: 'text-green-400 bg-green-900/30',
    amber: 'text-amber-400 bg-amber-900/30',
    purple: 'text-purple-400 bg-purple-900/30',
    red: 'text-red-400 bg-red-900/30',
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={clsx('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend !== undefined && (
          <div
            className={clsx(
              'flex items-center text-xs font-medium',
              trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'
            )}
          >
            {trend > 0 && '+'}
            {trend}%
            <TrendingUp className={clsx('w-3 h-3 ml-1', trend < 0 && 'rotate-180')} />
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-sm text-gray-400">{label}</p>
        {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}

export function UsageAnalytics({ sessions }: UsageAnalyticsProps) {
  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(
      (s) => s.status === 'running' || s.status === 'paused'
    ).length;
    const failedSessions = sessions.filter((s) => s.status === 'failed').length;

    // Calculate total tokens and messages
    const totalTokens = sessions.reduce((acc, s) => acc + (s.metrics?.tokens_used || 0), 0);
    const totalMessages = sessions.reduce((acc, s) => acc + (s.metrics?.messages_sent || 0), 0);
    const totalToolCalls = sessions.reduce((acc, s) => acc + (s.metrics?.tool_calls || 0), 0);

    // Calculate uptime
    const totalUptime = sessions.reduce((acc, s) => acc + (s.metrics?.uptime_seconds || 0), 0);
    const avgUptime = totalSessions > 0 ? totalUptime / totalSessions : 0;

    // Format uptime
    const formatUptime = (seconds: number) => {
      if (seconds < 60) return `${Math.round(seconds)}s`;
      if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
      if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
      return `${Math.round(seconds / 86400)}d`;
    };

    return {
      totalSessions,
      activeSessions,
      failedSessions,
      totalTokens,
      totalMessages,
      totalToolCalls,
      avgUptime: formatUptime(avgUptime),
      totalUptime: formatUptime(totalUptime),
    };
  }, [sessions]);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Usage Overview
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Active Agents"
          value={stats.activeSessions}
          subtext={`of ${stats.totalSessions} total`}
          icon={Activity}
          color="green"
        />
        <StatCard
          label="Total Tokens"
          value={stats.totalTokens}
          subtext="across all agents"
          icon={Zap}
          color="purple"
        />
        <StatCard
          label="Tool Calls"
          value={stats.totalToolCalls}
          icon={MessageSquare}
          color="blue"
        />
        <StatCard
          label="Avg Uptime"
          value={stats.avgUptime}
          subtext={`${stats.totalUptime} total`}
          icon={Clock}
          color="amber"
        />
      </div>
      {stats.failedSessions > 0 && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-300">
            {stats.failedSessions} agent{stats.failedSessions > 1 ? 's' : ''} in failed state
          </span>
        </div>
      )}
    </div>
  );
}
