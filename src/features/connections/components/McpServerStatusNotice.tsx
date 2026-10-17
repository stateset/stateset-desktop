import { Link } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { useMcpServerOptionsState } from '../hooks/useMcpServerOptions';
import { STATESET_STDIO_MCP_SERVERS } from '../statesetMcpServers';

interface McpServerStatusNoticeProps {
  /** Server ids the agent is configured to call. */
  servers: string[];
}

/**
 * Warns that an agent is configured to call MCP servers it has no credentials
 * for — otherwise those tool calls just fail mid-run with no explanation.
 */
export function McpServerStatusNotice({ servers }: McpServerStatusNoticeProps) {
  const { options, isLoading } = useMcpServerOptionsState();
  // Until the connections query settles every server looks unconnected, which
  // would flash a false warning on every page load.
  if (servers.length === 0 || isLoading) return null;

  // Local-only servers are a separate problem: they are not missing credentials,
  // they simply cannot be reached from a hosted agent, and the Connections page
  // offers nothing to click for them.
  const localOnly = STATESET_STDIO_MCP_SERVERS.filter((server) => servers.includes(server.id));
  const localOnlyIds = new Set(localOnly.map((server) => server.id));

  const selected = servers
    .filter((id) => !localOnlyIds.has(id))
    .map(
      (id) =>
        options.find((option) => option.id === id) ?? {
          id,
          name: id,
          connected: false,
          isLocalOnly: false,
        }
    );

  const missing = selected.filter((option) => !option.connected);
  // Credentials kept on this device are invisible to a hosted agent, which is
  // the very failure this notice exists to predict.
  const deviceOnly = selected.filter((option) => option.connected && option.isLocalOnly);

  if (missing.length === 0 && deviceOnly.length === 0 && localOnly.length === 0) return null;

  return (
    <div
      role="alert"
      className="mx-4 mt-3 p-3 ui-notice ui-notice-warning border rounded-xl flex items-start gap-3"
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm space-y-1">
        {missing.length > 0 && (
          <p>
            This agent uses {missing.length === 1 ? 'an MCP server' : 'MCP servers'} without stored
            credentials ({missing.map((option) => option.name).join(', ')}). Those tool calls will
            fail until you connect {missing.length === 1 ? 'it' : 'them'} on{' '}
            <Link
              to="/connections"
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 rounded"
            >
              Connections
            </Link>
            .
          </p>
        )}
        {deviceOnly.length > 0 && (
          <p>
            {deviceOnly.map((option) => option.name).join(', ')}{' '}
            {deviceOnly.length === 1 ? 'is' : 'are'} stored on this device only, so a hosted agent
            cannot read {deviceOnly.length === 1 ? 'its' : 'their'} credentials.
          </p>
        )}
        {localOnly.length > 0 && (
          <p>
            {localOnly.map((server) => server.name).join(', ')}{' '}
            {localOnly.length === 1 ? 'runs' : 'run'} as a local MCP server, so a hosted agent
            cannot call {localOnly.length === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>
    </div>
  );
}
