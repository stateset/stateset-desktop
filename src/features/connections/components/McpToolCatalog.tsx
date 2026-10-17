import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import clsx from 'clsx';
import type { McpServerOption } from '../hooks/useMcpServerOptions';

interface McpToolCatalogProps {
  servers: McpServerOption[];
}

/**
 * The tool names recorded for the connected MCP servers, searchable across
 * servers. Names are a stored sample (see `MAX_STORED_TOOLS`), while the counts
 * are what each server reported, so a large server's list can be partial.
 */
export function McpToolCatalog({ servers }: McpToolCatalogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const connected = servers.filter((server) => server.connected && server.isMcpServer);
  if (connected.length === 0) return null;

  // `toolCount` is what the server reported; `tools` is a capped sample of names.
  const totalTools = connected.reduce((sum, server) => sum + (server.toolCount ?? 0), 0);
  const needle = query.trim().toLowerCase();
  // A server can report more tools than the names kept for it.
  const isSample = connected.some(
    (server) => server.toolCount !== undefined && (server.tools?.length ?? 0) < server.toolCount
  );

  const matches = connected
    .map((server) => {
      const tools = server.tools ?? [];
      if (!needle) return { server, tools, nameMatched: true };
      if (server.name.toLowerCase().includes(needle)) return { server, tools, nameMatched: true };
      return {
        server,
        tools: tools.filter((tool) => tool.toLowerCase().includes(needle)),
        nameMatched: false,
      };
    })
    // Keep a server whose own name matched, and — with no search term — every
    // server, including those whose tool names were never stored.
    .filter((entry) => entry.nameMatched || entry.tools.length > 0);

  return (
    <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <span className="flex items-center gap-2 font-semibold text-sm">
          <ChevronRight
            className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-90')}
            aria-hidden="true"
          />
          Tool catalog
        </span>
        <span className="text-xs text-gray-500">
          {totalTools} {totalTools === 1 ? 'tool' : 'tools'} across {connected.length}{' '}
          {connected.length === 1 ? 'server' : 'servers'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg">
            <Search className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
            <input
              type="text"
              value={query}
              aria-label="Search tools"
              placeholder="Search tools"
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </label>

          {totalTools === 0 ? (
            <p className="text-sm text-gray-500">Test a server to see the tools it offers.</p>
          ) : matches.length === 0 ? (
            <p className="text-sm text-gray-500">
              No tools match that search.
              {isSample && ' Only the first tool names of each server are stored.'}
            </p>
          ) : (
            matches.map(({ server, tools }) => (
              <div key={server.id} data-testid={`catalog-${server.id}`}>
                <p className="text-xs text-gray-400 mb-1.5">
                  {server.name}
                  {server.toolCount !== undefined &&
                    tools.length > 0 &&
                    tools.length < server.toolCount && (
                      <span className="text-gray-600">
                        {' '}
                        · showing {tools.length} of {server.toolCount}
                      </span>
                    )}
                </p>
                <ul className="flex flex-wrap gap-1">
                  {tools.map((tool) => (
                    <li
                      key={tool}
                      className="px-1.5 py-0.5 bg-slate-800/70 border border-slate-700/60 rounded text-[10px] font-mono text-gray-300"
                    >
                      {tool}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
