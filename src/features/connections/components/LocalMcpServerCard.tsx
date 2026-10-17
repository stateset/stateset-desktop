import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import clsx from 'clsx';
import type { StatesetStdioMcpServer } from '../statesetMcpServers';
import { formatStdioClientConfig } from '../statesetMcpServers';

interface LocalMcpServerCardProps {
  server: StatesetStdioMcpServer;
}

export function LocalMcpServerCard({ server }: LocalMcpServerCardProps) {
  const [copied, setCopied] = useState(false);
  const config = formatStdioClientConfig(server);

  const copyConfig = () => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard
      .writeText(config)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
              server.color
            )}
          >
            {server.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{server.name}</h3>
              <span
                className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full"
                title="Runs as a local stdio process — cloud agents cannot reach it"
              >
                Local only
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{server.description}</p>
          </div>
        </div>

        {server.setupNote && <p className="text-xs text-amber-300 mt-3">{server.setupNote}</p>}

        <div className="mt-3 relative">
          <pre
            data-testid={`mcp-config-${server.id}`}
            role="region"
            aria-label={`${server.name} client configuration`}
            tabIndex={0}
            className="text-[11px] leading-relaxed bg-gray-950/70 border border-gray-800 rounded-lg p-3 pr-20 overflow-x-auto text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            {config}
          </pre>
          <button
            type="button"
            onClick={copyConfig}
            aria-label={`Copy ${server.name} MCP config`}
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-400" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" aria-hidden="true" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
