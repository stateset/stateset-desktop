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

const TYPE_CONFIG: Record<ActivityItem['type'], { color: string; label: string }> = {
  created: { color: 'bg-blue-500', label: 'Created' },
  started: { color: 'bg-green-500', label: 'Started' },
  stopped: { color: 'bg-gray-500', label: 'Stopped' },
  failed: { color: 'bg-red-500', label: 'Failed' },
};

const INITIAL_VISIBLE = 5;

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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Activity</h3>
      <div className="space-y-0">
        {visible.map((item, i) => {
          const config = TYPE_CONFIG[item.type];
          return (
            <div
              key={`${item.sessionName}-${item.type}-${i}`}
              className="flex items-start gap-3 py-1.5"
            >
              <div className="flex flex-col items-center mt-1.5">
                <div className={clsx('w-2 h-2 rounded-full', config.color)} />
                {i < visible.length - 1 && <div className="w-px h-4 bg-gray-800 mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{item.sessionName}</span>
                  <span className="text-[10px] text-gray-500 uppercase">{config.label}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ChevronDown
            className={clsx('w-3.5 h-3.5 transition-transform', showAll && 'rotate-180')}
          />
          {showAll ? 'Show less' : `Show ${activities.length - INITIAL_VISIBLE} more`}
        </button>
      )}
    </div>
  );
});
