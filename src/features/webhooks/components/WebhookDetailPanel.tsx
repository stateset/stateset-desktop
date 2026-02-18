import { useState } from 'react';
import { X, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { Webhook, WebhookDelivery } from '../../../types';
import { useWebhookDeliveries } from '../hooks/useWebhooks';

interface WebhookDetailPanelProps {
  webhook: Webhook;
  onClose: () => void;
}

export function WebhookDetailPanel({ webhook, onClose }: WebhookDetailPanelProps) {
  const { data: deliveries, isLoading, refetch } = useWebhookDeliveries(webhook.id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="w-full max-w-xl bg-gray-900 border-l border-gray-800 flex flex-col h-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{webhook.name}</h2>
            <p className="text-xs text-gray-500 truncate mt-0.5">{webhook.url}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Webhook Info */}
        <div className="px-5 py-3 border-b border-gray-800 space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500">Status:</span>{' '}
              <span
                className={clsx(
                  'capitalize',
                  webhook.status === 'active' && 'text-green-400',
                  webhook.status === 'paused' && 'text-amber-400',
                  webhook.status === 'failed' && 'text-red-400'
                )}
              >
                {webhook.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Direction:</span>{' '}
              <span className="capitalize">{webhook.direction}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {webhook.events.map((event) => (
              <span
                key={event}
                className="px-2 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded"
              >
                {event}
              </span>
            ))}
          </div>
        </div>

        {/* Deliveries Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">Recent Deliveries</h3>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            title="Refresh deliveries"
          >
            <RefreshCw className={clsx('w-4 h-4 text-gray-400', isLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Deliveries List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : !deliveries?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Clock className="w-8 h-8 mb-2" />
              <p className="text-sm">No deliveries yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {deliveries.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        {delivery.success ? (
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{delivery.event}</span>
            {delivery.status_code !== null && (
              <span
                className={clsx(
                  'text-xs px-1.5 py-0.5 rounded',
                  delivery.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                )}
              >
                {delivery.status_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span>{new Date(delivery.created_at).toLocaleString()}</span>
            <span>{delivery.duration_ms}ms</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 ml-7 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Request Body</p>
            <pre className="text-xs bg-gray-800 rounded-lg p-3 overflow-x-auto max-h-32 text-gray-300">
              {formatJson(delivery.request_body)}
            </pre>
          </div>
          {delivery.response_body && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Response Body
              </p>
              <pre className="text-xs bg-gray-800 rounded-lg p-3 overflow-x-auto max-h-32 text-gray-300">
                {formatJson(delivery.response_body)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
