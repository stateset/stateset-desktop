import { useState } from 'react';
import { X } from 'lucide-react';
import { WebhookEventPicker } from './WebhookEventPicker';

interface WebhookFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    url: string;
    events: string[];
    direction: string;
  }) => Promise<void>;
  isLoading: boolean;
  initial?: { name: string; url: string; events: string[]; direction: string };
}

export function WebhookForm({ isOpen, onClose, onSubmit, isLoading, initial }: WebhookFormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [events, setEvents] = useState<string[]>(initial?.events || []);
  const [direction, setDirection] = useState(initial?.direction || 'outgoing');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, url, events, direction });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{initial ? 'Edit Webhook' : 'Create Webhook'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Webhook"
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Direction</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="outgoing"
                  checked={direction === 'outgoing'}
                  onChange={() => setDirection('outgoing')}
                  className="accent-brand-500"
                />
                <span className="text-sm">Outgoing</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="incoming"
                  checked={direction === 'incoming'}
                  onChange={() => setDirection('incoming')}
                  className="accent-brand-500"
                />
                <span className="text-sm">Incoming</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Events</label>
            <WebhookEventPicker selected={events} onChange={setEvents} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !url.trim() || events.length === 0}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg font-medium transition-colors"
            >
              {isLoading ? 'Saving...' : initial ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
