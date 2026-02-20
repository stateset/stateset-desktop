import { useState } from 'react';
import { Plus, Webhook as WebhookIcon, Search } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  WebhookCard,
  WebhookForm,
  WebhookDetailPanel,
  useWebhooksList,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '../features/webhooks';
import type { Webhook } from '../types';

export default function Webhooks() {
  usePageTitle('Webhooks');

  const { data: webhooks, isLoading } = useWebhooksList();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();

  const [showForm, setShowForm] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCreate = async (data: {
    name: string;
    url: string;
    events: string[];
    direction: string;
  }) => {
    await createWebhook.mutateAsync(data);
    setShowForm(false);
  };

  const handleToggleStatus = (webhook: Webhook) => {
    updateWebhook.mutate({
      webhookId: webhook.id,
      data: { status: webhook.status === 'active' ? 'paused' : 'active' },
    });
  };

  const handleDelete = (webhook: Webhook) => {
    deleteWebhook.mutate(webhook.id);
  };

  const handleTest = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    try {
      await testWebhook.mutateAsync(webhook.id);
    } finally {
      setTestingId(null);
    }
  };

  const filteredWebhooks = webhooks?.filter(
    (w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage webhook endpoints for real-time event notifications
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium border border-brand-600/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          aria-label="Create webhook"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create Webhook
        </button>
      </div>

      {/* Search */}
      {webhooks && webhooks.length > 0 && (
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search webhooks..."
            aria-label="Search webhooks"
            className="w-full pl-10 pr-4 py-2 bg-gray-900/90 border border-gray-800 rounded-lg focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 text-sm"
          />
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!webhooks || webhooks.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <WebhookIcon className="w-8 h-8" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-1">No webhooks configured</h3>
          <p className="text-sm mb-4">
            Create your first webhook to receive real-time notifications
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium border border-brand-600/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            aria-label="Create webhook"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create Webhook
          </button>
        </div>
      )}

      {/* Webhook List */}
      {filteredWebhooks && filteredWebhooks.length > 0 && (
        <div className="grid gap-3">
          {filteredWebhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onTest={() => handleTest(webhook)}
              onToggleStatus={() => handleToggleStatus(webhook)}
              onDelete={() => handleDelete(webhook)}
              onViewDetails={() => setSelectedWebhook(webhook)}
              isTesting={testingId === webhook.id}
            />
          ))}
        </div>
      )}

      {/* No search results */}
      {filteredWebhooks && filteredWebhooks.length === 0 && searchQuery && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No webhooks match &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}

      {/* Create Form Modal */}
      <WebhookForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleCreate}
        isLoading={createWebhook.isPending}
      />

      {/* Detail Panel */}
      {selectedWebhook && (
        <WebhookDetailPanel webhook={selectedWebhook} onClose={() => setSelectedWebhook(null)} />
      )}
    </div>
  );
}
