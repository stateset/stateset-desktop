import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, PlugZap, XCircle } from 'lucide-react';
import { getErrorMessage } from '../../../lib/errors';
import type { McpProbeResult } from '../../../vite-env';

interface McpProbeButtonProps {
  endpoint: string;
  authToken?: string;
  /** Called when a handshake succeeds, so the result can be remembered. */
  onVerified?: (result: Extract<McpProbeResult, { ok: true }>) => void;
}

/**
 * Runs the MCP handshake against an endpoint before its credentials are saved,
 * so the user sees whether the server answers and which tools it offers.
 */
export function McpProbeButton({ endpoint, authToken, onVerified }: McpProbeButtonProps) {
  const [isProbing, setIsProbing] = useState(false);
  const [result, setResult] = useState<McpProbeResult | null>(null);
  // Identifies what the form currently describes; a probe that resolves after
  // the form moved on must not be shown or recorded against the new target.
  const targetRef = useRef('');
  targetRef.current = `${endpoint}\u0000${authToken ?? ''}`;

  // A result describes the endpoint and token it was run against; once either
  // changes it is no longer about what the form now says.
  useEffect(() => {
    setResult(null);
  }, [endpoint, authToken]);

  const runProbe = async () => {
    const api = window.electronAPI;
    if (!api?.mcp) {
      setResult({ ok: false, error: 'Testing is only available in the desktop app.' });
      return;
    }

    setIsProbing(true);
    setResult(null);
    const token = authToken?.trim();
    const probedTarget = targetRef.current;
    try {
      const probed = await api.mcp.probe(token ? { endpoint, authToken: token } : { endpoint });
      if (targetRef.current !== probedTarget) return;
      setResult(probed);
      if (probed.ok) onVerified?.(probed);
    } catch (error) {
      if (targetRef.current !== probedTarget) return;
      setResult({ ok: false, error: getErrorMessage(error) });
    } finally {
      // Always clear: only the result is stale, and the button is disabled
      // while probing so there is no overlapping run to worry about.
      setIsProbing(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runProbe}
        disabled={!endpoint.trim() || isProbing}
        className="ui-button ui-button-secondary inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
      >
        {isProbing ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <PlugZap className="w-4 h-4" aria-hidden="true" />
        )}
        Test server
      </button>

      {result?.ok && (
        <p role="status" className="text-xs ui-positive flex items-start gap-1.5">
          <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            {result.serverName} {result.serverVersion} · {result.toolCount}{' '}
            {result.toolCount === 1 ? 'tool' : 'tools'}
            {result.tools.length > 0 && (
              <span className="text-gray-400"> — {result.tools.slice(0, 5).join(', ')}</span>
            )}
          </span>
        </p>
      )}

      {result && !result.ok && (
        <p role="alert" className="text-xs ui-negative flex items-start gap-1.5">
          <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {result.error}
        </p>
      )}
    </div>
  );
}
