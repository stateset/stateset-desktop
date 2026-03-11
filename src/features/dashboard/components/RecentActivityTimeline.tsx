import { useState, useMemo, memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { AgentSession } from '../../../types';

interface ActivityItem {
  type: 'created' | 'started' | 'stopped' | 'failed';
  sessionName: string;
  agentType: string;
  timestamp: Date;
}

const TYPE_CONFIG: Record<ActivityItem['type'], { color: string; bg: string; label: string }> = {
  created: { color: 'text-blue-400', bg: 'bg-blue-500', label: 'Created' },
  started: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Started' },
  stopped: { color: 'text-slate-400', bg: 'bg-slate-500', label: 'Stopped' },
  failed: { color: 'text-rose-400', bg: 'bg-rose-500', label: 'Failed' },
};

const INITIAL_VISIBLE = 6;

interface RecentActivityTimelineProps {
  sessions: AgentSession[];
}

export const RecentActivityTimeline = memo(function RecentActivityTimeline({
  sessions,
}: RecentActivityTimelineProps) {
  const [showAll, setShowAll] = useState(false);

  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    for (const s of sessions) {
      const name = s.name || s.agent_type;
      items.push({
        type: 'created',
        sessionName: name,
        agentType: s.agent_type,
        timestamp: new Date(s.created_at),
      });
      if (s.started_at) {
        items.push({
          type: 'started',
          sessionName: name,
          agentType: s.agent_type,
          timestamp: new Date(s.started_at),
        });
      }
      if (s.stopped_at) {
        items.push({
          type: s.status === 'failed' ? 'failed' : 'stopped',
          sessionName: name,
          agentType: s.agent_type,
          timestamp: new Date(s.stopped_at),
        });
      }
    }

    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 20);
  }, [sessions]);

  if (activities.length === 0) return null;

  const visible = showAll ? activities : activities.slice(0, INITIAL_VISIBLE);
  const hasMore = activities.length > INITIAL_VISIBLE;

  return (
    <div className="relative bg-slate-900/40 border border-slate-700/40 rounded-2xl overflow-hidden backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/50">
        <h3 className="text-sm font-bold text-gray-300 tracking-tight">Recent Activity</h3>
      </div>
      <div className="px-4 py-3">
        <div className="relative">
          {/* Timeline connector line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-slate-700 via-slate-700/50 to-transparent" />

          <div className="space-y-0.5">
            {visible.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <div
                  key={`${item.sessionName}-${item.type}-${i}`}
                  className="relative flex items-start gap-3 py-1.5 group"
                >
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1 flex-shrink-0">
                    <div
                      className={clsx(
                        'w-[15px] h-[15px] rounded-full flex items-center justify-center',
                        'bg-slate-900 border border-slate-700/80'
                      )}
                    >
                      <div className={clsx('w-[7px] h-[7px] rounded-full', cfg.bg)} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-gray-300 truncate">
                        {item.sessionName}
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-bold uppercase tracking-wider',
                          cfg.color
                        )}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-600">
                      {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1.5 mt-3 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            aria-label={
              showAll
                ? 'Show fewer activity items'
                : `Show ${activities.length - INITIAL_VISIBLE} more activity items`
            }
          >
            <ChevronDown
              className={clsx('w-3.5 h-3.5 transition-transform', showAll && 'rotate-180')}
              aria-hidden="true"
            />
            {showAll ? 'Show less' : `${activities.length - INITIAL_VISIBLE} more`}
          </button>
        )}
      </div>
    </div>
  );
});
