import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../../components/ToastProvider';
import { normalizeCustomPlatformId } from '../utils';

interface CustomMcpFormProps {
  isStoring: boolean;
  onAdd: (platformId: string, creds: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

export function CustomMcpForm({ isStoring, onAdd, onCancel }: CustomMcpFormProps) {
  const { showToast } = useToast();
  const [serverId, setServerId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [authToken, setAuthToken] = useState('');

  const handleAdd = async () => {
    const platformId = normalizeCustomPlatformId(serverId);
    if (!platformId) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: 'Please provide a server identifier.',
      });
      return;
    }
    if (!endpoint.trim()) {
      showToast({
        variant: 'error',
        title: 'Missing info',
        message: 'Please provide an MCP endpoint or command.',
      });
      return;
    }
    if (platformId.length < 3) {
      showToast({
        variant: 'error',
        title: 'Invalid server id',
        message: 'Server identifier should be at least 3 characters long.',
      });
      return;
    }

    const creds: Record<string, string> = { endpoint: endpoint.trim() };
    if (authToken.trim()) {
      creds.auth_token = authToken.trim();
    }

    await onAdd(platformId, creds);
    setServerId('');
    setEndpoint('');
    setAuthToken('');
    showToast({
      variant: 'success',
      title: 'Custom MCP server added',
      message: `${platformId} is now available for agent configuration.`,
    });
  };

  return (
    <div className="mb-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="font-semibold mb-3">Add custom MCP server</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm text-gray-400">Server identifier</span>
          <input
            type="text"
            value={serverId}
            placeholder="my-mcp-server"
            onChange={(e) => setServerId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-gray-400">Endpoint / Command</span>
          <input
            type="text"
            value={endpoint}
            placeholder="https://... or custom command"
            onChange={(e) => setEndpoint(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-gray-400">Auth token (optional)</span>
          <input
            type="password"
            value={authToken}
            placeholder="Optional API key or token"
            onChange={(e) => setAuthToken(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleAdd}
          disabled={isStoring}
          type="button"
          className="px-3 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          {isStoring ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden="true" />
          ) : (
            'Add server'
          )}
        </button>
        <button
          onClick={onCancel}
          type="button"
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
