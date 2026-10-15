import { useState } from 'react';
import { ChevronRight, Loader2, Wrench, XCircle, Check } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../../../types';

interface ToolActivityBubbleProps {
  message: ChatMessage;
}

/** Inline record of an MCP tool the agent called during a conversation. */
export function ToolActivityBubble({ message }: ToolActivityBubbleProps) {
  const [showDetails, setShowDetails] = useState(false);
  const tool = message.tool;
  const name = tool?.name ?? message.content;
  const status = tool?.status ?? 'running';
  const args = tool?.arguments;
  const hasArgs = args !== undefined && Object.keys(args).length > 0;
  const hasDetails = hasArgs || Boolean(tool?.resultPreview);

  return (
    <div className="flex gap-3 animate-fade-in">
      <div
        className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          status === 'error' ? 'bg-red-600/20' : 'bg-slate-800'
        )}
      >
        <Wrench
          className={clsx('w-4 h-4', status === 'error' ? 'text-red-400' : 'text-gray-400')}
          aria-hidden="true"
        />
      </div>

      <div
        className={clsx(
          'max-w-[76%] rounded-2xl px-4 py-2.5 border bg-slate-900/50',
          status === 'error' ? 'border-red-800/50' : 'border-slate-700/50'
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-gray-200">{name}</span>
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              Running…
            </span>
          )}
          {status === 'success' && (
            <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-300">
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Failed
            </span>
          )}
          {tool?.durationMs !== undefined && (
            <span className="text-[10px] text-gray-500">{tool.durationMs}ms</span>
          )}
        </div>

        {hasDetails && (
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
            aria-label={`Toggle details for ${name}`}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
          >
            <ChevronRight
              className={clsx('w-3 h-3 transition-transform', showDetails && 'rotate-90')}
              aria-hidden="true"
            />
            Details
          </button>
        )}

        {showDetails && (
          <div className="mt-2 space-y-2">
            {hasArgs && (
              <pre className="text-[11px] bg-slate-950/70 border border-slate-800 rounded-lg p-2 overflow-x-auto text-gray-300">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
            {tool?.resultPreview && (
              <pre className="text-[11px] bg-slate-950/70 border border-slate-800 rounded-lg p-2 overflow-x-auto text-gray-400">
                {tool.resultPreview}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
