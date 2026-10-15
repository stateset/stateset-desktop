import { isVerificationStale } from './mcpVerifications';
import type { McpServerOption } from './hooks/useMcpServerOptions';

export interface McpServerSummary {
  /** Servers with stored credentials. */
  connected: number;
  /** Connected servers whose last handshake is recent. */
  verified: number;
  /** Connected servers verified too long ago to trust. */
  stale: number;
  /** Connected servers that have never been verified. */
  unverified: number;
  /** Tools across verified servers. */
  tools: number;
}

/** Rolls the picker's options up into the counts shown on the dashboard. */
export function summarizeMcpServers(
  options: McpServerOption[],
  now: number = Date.now()
): McpServerSummary {
  // Platform integrations can be listed in `mcp_servers` but are not MCP servers.
  const connectedOptions = options.filter((option) => option.connected && option.isMcpServer);

  let verified = 0;
  let stale = 0;
  let tools = 0;

  for (const option of connectedOptions) {
    if (!option.verifiedAt) continue;
    if (isVerificationStale(option.verifiedAt, now)) {
      stale += 1;
    } else {
      verified += 1;
      tools += option.toolCount ?? 0;
    }
  }

  return {
    connected: connectedOptions.length,
    verified,
    stale,
    unverified: connectedOptions.length - verified - stale,
    tools,
  };
}
