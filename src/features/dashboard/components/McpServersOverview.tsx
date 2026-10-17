import { Link } from 'react-router';
import { Plug, ArrowRight } from 'lucide-react';
import { useMcpServerOptions } from '../../connections/hooks/useMcpServerOptions';
import { summarizeMcpServers } from '../../connections/mcpSummary';

/** Sidebar card: how many MCP servers agents can call, and how fresh that knowledge is. */
export function McpServersOverview() {
  const options = useMcpServerOptions();
  const summary = summarizeMcpServers(options);
  const needsAttention = summary.stale + summary.unverified;

  return (
    <div className="relative bg-slate-900/40 border border-slate-700/40 rounded-2xl overflow-hidden backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-300 tracking-tight">MCP Servers</h3>
        <Link
          to="/connections"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
        >
          Manage
        </Link>
      </div>

      {summary.connected === 0 ? (
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-400">No MCP servers connected yet</p>
          <Link
            to="/connections"
            className="inline-flex items-center gap-1.5 text-sm ui-link transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
          >
            <Plug className="w-3.5 h-3.5" aria-hidden="true" />
            Connect a server
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-gray-400">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              Connected
            </span>
            <span
              data-testid="mcp-connected"
              className="text-sm font-bold text-gray-200 tabular-nums"
            >
              {summary.connected}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Verified
            </span>
            <span
              data-testid="mcp-verified"
              className="text-sm font-bold text-gray-200 tabular-nums"
            >
              {summary.verified}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-sm text-gray-400">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Needs a test
            </span>
            <span
              data-testid="mcp-needs-test"
              className="text-sm font-bold text-gray-200 tabular-nums"
            >
              {needsAttention}
            </span>
          </div>
          {summary.tools > 0 && (
            <p className="text-xs text-gray-500 pt-1 border-t border-slate-700/40">
              {summary.tools} {summary.tools === 1 ? 'tool' : 'tools'} available
            </p>
          )}
        </div>
      )}
    </div>
  );
}
