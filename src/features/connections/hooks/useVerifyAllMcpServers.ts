import { useCallback, useState } from 'react';
import { localSecretsApi } from '../../../lib/localSecrets';
import { getErrorMessage } from '../../../lib/errors';
import type { McpProbeResult } from '../../../vite-env';

export interface VerifyAllSummary {
  verified: number;
  failed: number;
  total: number;
  /** True when nothing could be tested because the probe is unavailable. */
  unavailable?: boolean;
  /** Set when the stored connections could not be read at all. */
  error?: string;
}

interface UseVerifyAllMcpServersOptions {
  tenantId: string;
  brandId: string;
  record: (platformId: string, result: Extract<McpProbeResult, { ok: true }>) => Promise<void>;
  /** Drops the stored handshake for a server that just failed to answer. */
  forget?: (platformId: string) => Promise<void>;
}

const EMPTY_SUMMARY: VerifyAllSummary = { verified: 0, failed: 0, total: 0 };

/**
 * Re-runs the MCP handshake against every locally stored server, one at a time,
 * and records each success. Only locally stored credentials can be probed —
 * vault-held tokens never reach the renderer.
 */
export function useVerifyAllMcpServers({
  tenantId,
  brandId,
  record,
  forget,
}: UseVerifyAllMcpServersOptions) {
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyAll = useCallback(async (): Promise<VerifyAllSummary> => {
    if (!tenantId || !brandId) return EMPTY_SUMMARY;

    setIsVerifying(true);
    try {
      let servers: { platform: string; endpoint: string; authToken?: string }[];
      try {
        servers = await localSecretsApi.listMcpEndpoints(tenantId, brandId);
      } catch (error) {
        // Reading the local vault failed; the click must still explain itself.
        return { ...EMPTY_SUMMARY, error: getErrorMessage(error) };
      }
      const probe = window.electronAPI?.mcp?.probe;
      if (!probe) {
        // Nothing was tested, which is not the same as everything failing.
        return { verified: 0, failed: 0, total: servers.length, unavailable: true };
      }

      let verified = 0;
      let failed = 0;

      for (const server of servers) {
        let result: McpProbeResult;
        try {
          result = await probe(
            server.authToken
              ? { endpoint: server.endpoint, authToken: server.authToken }
              : { endpoint: server.endpoint }
          );
        } catch {
          // Could not even ask, so nothing has been disproved; one bad server
          // must not stop the rest either.
          failed += 1;
          continue;
        }

        if (result.ok) {
          await record(server.platform, result).catch(() => {});
          verified += 1;
          continue;
        }

        failed += 1;
        // Only an answer from the server disproves what we recorded. Being
        // offline or timing out says nothing about the server.
        if (!result.unreachable) {
          await forget?.(server.platform).catch(() => {});
        }
      }

      return { verified, failed, total: servers.length };
    } finally {
      setIsVerifying(false);
    }
  }, [tenantId, brandId, record, forget]);

  return { verifyAll, isVerifying };
}
