import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  Wrench,
  RefreshCw,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow, format } from 'date-fns';

export type TimelineEventType =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'message_sent'
  | 'message_received'
  | 'tool_call'
  | 'loop_completed'
  | 'error'
  | 'config_changed';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: number;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface SessionTimelineProps {
  events: TimelineEvent[];
  maxVisible?: number;
  showRelativeTime?: boolean;
  className?: string;
}

const eventConfig: Record<
  TimelineEventType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  started: { icon: Play, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  paused: { icon: Pause, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  resumed: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  stopped: { icon: Square, color: 'text-gray-400', bg: 'bg-slate-800/60' },
  completed: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  failed: { icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/15' },
  message_sent: { icon: MessageSquare, color: 'text-brand-400', bg: 'bg-brand-500/15' },
  message_received: { icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/15' },
  tool_call: { icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  loop_completed: { icon: Zap, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  error: { icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/15' },
  config_changed: { icon: RefreshCw, color: 'text-gray-400', bg: 'bg-slate-800/60' },
};

export const SessionTimeline = memo(function SessionTimeline({
  events,
  maxVisible = 50,
  showRelativeTime = true,
  className,
}: SessionTimelineProps) {
  const visibleEvents = useMemo(() => {
    return [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, maxVisible);
  }, [events, maxVisible]);

  if (events.length === 0) {
    return (
      <div className={clsx('p-8 text-center text-gray-500', className)}>
        <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>No events yet</p>
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)}>
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-brand-500/40 via-slate-700/50 to-transparent" />

      {/* Events */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {visibleEvents.map((event, index) => (
            <TimelineItem
              key={event.id}
              event={event}
              isFirst={index === 0}
              showRelativeTime={showRelativeTime}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Show more indicator */}
      {events.length > maxVisible && (
        <div className="mt-4 pl-10 text-sm font-medium text-gray-500">
          +{events.length - maxVisible} more events
        </div>
      )}
    </div>
  );
});

interface TimelineItemProps {
  event: TimelineEvent;
  isFirst: boolean;
  showRelativeTime: boolean;
}

const TimelineItem = memo(function TimelineItem({
  event,
  isFirst,
  showRelativeTime,
}: TimelineItemProps) {
  const config = eventConfig[event.type] || eventConfig.started;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      className="relative pl-12"
    >
      {/* Icon */}
      <div
        className={clsx(
          'absolute left-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-sm',
          config.bg,
          isFirst && 'ring-2 ring-offset-2 ring-offset-slate-900 ring-brand-500/50'
        )}
      >
        <Icon className={clsx('w-4 h-4', config.color)} />
      </div>

      {/* Content */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 shadow-sm backdrop-blur-sm hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-gray-200">{event.title}</h4>
            {event.description && (
              <p className="text-sm font-medium text-gray-400 mt-0.5">{event.description}</p>
            )}
          </div>
          <span className="text-xs font-medium text-gray-500 flex-shrink-0">
            {showRelativeTime
              ? formatDistanceToNow(event.timestamp, { addSuffix: true })
              : format(event.timestamp, 'HH:mm:ss')}
          </span>
        </div>

        {/* Metadata */}
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(event.metadata).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium bg-slate-900/60 text-gray-300 rounded-lg border border-slate-700/40 shadow-inner"
              >
                <span className="text-gray-500 mr-1.5 font-bold uppercase tracking-wider">
                  {key}:
                </span>
                {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
});

// Compact timeline for sidebar/cards
interface CompactTimelineProps {
  events: TimelineEvent[];
  maxVisible?: number;
  className?: string;
}

export const CompactTimeline = memo(function CompactTimeline({
  events,
  maxVisible = 5,
  className,
}: CompactTimelineProps) {
  const visibleEvents = useMemo(() => {
    return [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, maxVisible);
  }, [events, maxVisible]);

  if (events.length === 0) {
    return null;
  }

  return (
    <div className={clsx('space-y-1.5', className)}>
      {visibleEvents.map((event) => {
        const config = eventConfig[event.type] || eventConfig.started;
        const Icon = config.icon;

        return (
          <div
            key={event.id}
            className="flex items-center gap-2.5 text-xs p-1.5 rounded-lg hover:bg-slate-800/40 transition-colors"
          >
            <div className={clsx('p-1 rounded-md', config.bg)}>
              <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', config.color)} />
            </div>
            <span className="text-gray-300 font-medium truncate flex-1">{event.title}</span>
            <span className="text-gray-500 font-medium flex-shrink-0">
              {formatDistanceToNow(event.timestamp, { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
});

// Helper to create timeline events
// eslint-disable-next-line react-refresh/only-export-components
export function createTimelineEvent(
  type: TimelineEventType,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>
): TimelineEvent {
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    timestamp: Date.now(),
    title,
    description,
    metadata,
  };
}
