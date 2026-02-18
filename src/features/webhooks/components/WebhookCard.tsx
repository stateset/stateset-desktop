import { Webhook, Globe, Pause, Play, Trash2, Send, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { Webhook as WebhookType } from '../../../types';

interface WebhookCardProps {
  webhook: WebhookType;
  onTest: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  isTesting: boolean;
}

export function WebhookCard({
  webhook,
  onTest,
  onToggleStatus,
  onDelete,
  onViewDetails,
  isTesting,
}: WebhookCardProps) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-500',
    paused: 'bg-amber-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
            {webhook.direction === 'incoming' ? (
              <Webhook className="w-5 h-5 text-brand-400" />
            ) : (
              <Globe className="w-5 h-5 text-brand-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{webhook.name}</h3>
              <span
                className={clsx(
                  'w-2 h-2 rounded-full',
                  statusColors[webhook.status] || 'bg-gray-500'
                )}
              />
              <span className="text-xs text-gray-500 capitalize">{webhook.status}</span>
            </div>
            <p className="text-sm text-gray-400 truncate mt-0.5">{webhook.url}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {webhook.events.slice(0, 3).map((event) => (
                <span
                  key={event}
                  className="px-2 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded"
                >
                  {event}
                </span>
              ))}
              {webhook.events.length > 3 && (
                <span className="px-2 py-0.5 text-[10px] bg-gray-800 text-gray-500 rounded">
                  +{webhook.events.length - 3} more
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-3">
          <button
            onClick={onTest}
            disabled={isTesting || webhook.status !== 'active'}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            title="Test webhook"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleStatus}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title={webhook.status === 'active' ? 'Pause' : 'Activate'}
          >
            {webhook.status === 'active' ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 hover:text-red-400 transition-colors"
            title="Delete webhook"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onViewDetails}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title="View deliveries"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {webhook.last_triggered_at && (
        <p className="text-[10px] text-gray-600 mt-2">
          Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
