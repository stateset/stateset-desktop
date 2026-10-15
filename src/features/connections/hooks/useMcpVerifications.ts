import { useCallback, useEffect } from 'react';
import { useMcpVerificationsStore } from '../../../stores/mcpVerifications';
import type { McpProbeResult } from '../../../vite-env';
import type { McpVerification } from '../mcpVerifications';

/**
 * Reads and writes the shared verification store for one brand. Every consumer
 * — the connection cards, the tool catalog, the pickers and the dashboard —
 * sees the same map, so a handshake recorded in one place shows up everywhere.
 */
export function useMcpVerifications(brandId: string) {
  const entries = useMcpVerificationsStore((state) => state.entries);
  const isLoaded = useMcpVerificationsStore((state) => state.isLoaded);
  const load = useMcpVerificationsStore((state) => state.load);
  const recordEntry = useMcpVerificationsStore((state) => state.record);
  const forgetEntry = useMcpVerificationsStore((state) => state.forget);

  useEffect(() => {
    if (!brandId || isLoaded) return;
    void load();
  }, [brandId, isLoaded, load]);

  const record = useCallback(
    (platformId: string, result: Extract<McpProbeResult, { ok: true }>) =>
      recordEntry(brandId, platformId, result),
    [brandId, recordEntry]
  );

  const forget = useCallback(
    (platformId: string) => forgetEntry(brandId, platformId),
    [brandId, forgetEntry]
  );

  const verifications: Record<string, McpVerification> = Object.fromEntries(
    Object.entries(entries)
      .filter(([key]) => key.startsWith(`${brandId}:`))
      .map(([key, value]) => [key.slice(brandId.length + 1), value])
  );

  return { verifications, record, forget };
}
