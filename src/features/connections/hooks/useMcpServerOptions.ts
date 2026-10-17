import { useConnections } from './useConnections';
import { useMcpVerifications } from './useMcpVerifications';
import { useAuthStore } from '../../../stores/auth';
import { STATESET_HTTP_MCP_SERVERS, isStatesetHttpMcpServer } from '../statesetMcpServers';
import { isBuiltInPlatform } from '../utils';

export interface McpServerOption {
  id: string;
  name: string;
  connected: boolean;
  /** Tools the server reported the last time it was verified, if ever. */
  toolCount?: number;
  tools?: string[];
  /** ISO timestamp of that verification. */
  verifiedAt?: string;
  /** Credentials are stored on this device only, so a hosted agent cannot read them. */
  isLocalOnly: boolean;
  /**
   * Whether this is an MCP server rather than a platform integration. Platform
   * connections (Shopify, Gorgias, …) can be named in `mcp_servers` too, so the
   * picker lists both, but only real MCP servers are counted as such.
   */
  isMcpServer: boolean;
}

/** StateSet servers and custom entries are MCP servers; the built-in platforms are not. */
function isMcpServerId(id: string): boolean {
  return isStatesetHttpMcpServer(id) || !isBuiltInPlatform(id);
}

/**
 * MCP servers an agent can be given, with whether the connections query has
 * settled — callers that warn about missing credentials must not warn while the
 * answer is still unknown.
 */
export function useMcpServerOptionsState(): {
  options: McpServerOption[];
  /** True while the answer is unknown — still loading, or the query failed. */
  isLoading: boolean;
} {
  const currentBrand = useAuthStore((state) => state.currentBrand);
  // Silent: the Connections page owns the error toast for this query.
  const { displayedPlatforms, isConnected, isLocalConnection, hasConnectionData } = useConnections({
    notifyOnError: false,
  });
  const { verifications } = useMcpVerifications(currentBrand?.id ?? '');

  const options = [...STATESET_HTTP_MCP_SERVERS, ...displayedPlatforms].map((platform) => {
    const verification = verifications[platform.id];
    return {
      id: platform.id,
      name: platform.name,
      connected: isConnected(platform.id),
      isLocalOnly: isLocalConnection(platform.id),
      toolCount: verification?.toolCount,
      tools: verification?.tools,
      verifiedAt: verification?.verifiedAt,
      isMcpServer: isMcpServerId(platform.id),
    };
  });

  // Loading, failed and never-asked all mean the same thing to a caller that
  // warns about missing credentials: not yet known.
  return { options, isLoading: !hasConnectionData };
}

/** MCP servers an agent can be given: hosted StateSet servers, then built-in and custom platforms. */
export function useMcpServerOptions(): McpServerOption[] {
  return useMcpServerOptionsState().options;
}
