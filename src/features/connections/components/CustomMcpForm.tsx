import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../../components/ToastProvider';
import { normalizeCustomPlatformId } from '../utils';
import { McpProbeButton } from './McpProbeButton';
import type { McpProbeResult } from '../../../vite-env';

interface CustomMcpFormProps {
  isStoring: boolean;
  onAdd: (platformId: string, creds: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  /** Called with a pre-save handshake once the server it described is saved. */
  onVerified?: (platformId: string, result: Extract<McpProbeResult, { ok: true }>) => void;
}

export function CustomMcpForm({ isStoring, onAdd, onCancel, onVerified }: CustomMcpFormProps) {
  const { showToast } = useToast();
  const [serverId, setServerId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [probed, setProbed] = useState<Extract<McpProbeResult, { ok: true }> | null>(null);

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

    try {
      await onAdd(platformId, creds);
    } catch {
      // Reported by the mutation that owns the save; keep what was typed.
      return;
    }
    // The probe ran before the server had an id; attach it now.
    if (probed) onVerified?.(platformId, probed);
    setProbed(null);
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
            className="input-base"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-gray-400">Endpoint / Command</span>
          <input
            type="text"
            value={endpoint}
            placeholder="https://... or custom command"
            onChange={(e) => {
              setEndpoint(e.target.value);
              setProbed(null);
            }}
            className="input-base"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm text-gray-400">Auth token (optional)</span>
          <input
            type="password"
            value={authToken}
            placeholder="Optional API key or token"
            onChange={(e) => {
              setAuthToken(e.target.value);
              setProbed(null);
            }}
            autoComplete="off"
            className="input-base"
          />
          <span className="text-[11px] text-gray-500">
            Used to authenticate requests to this MCP server.
          </span>
        </label>
      </div>
      <div className="mt-4">
        <McpProbeButton endpoint={endpoint} authToken={authToken} onVerified={setProbed} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleAdd}
          disabled={isStoring}
          type="button"
          className="ui-button ui-button-primary px-3 py-2 rounded-lg text-sm"
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
          className="ui-button ui-button-secondary px-3 py-2 rounded-lg text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
