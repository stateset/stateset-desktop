import { useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { McpServerPicker } from '../../connections/components/McpServerPicker';
import { useMcpServerOptions } from '../../connections/hooks/useMcpServerOptions';

interface QuickConfigBarProps {
  model: string;
  temperature: number;
  mcpServers: string[];
  onModelChange: (model: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onMcpServersChange: (servers: string[]) => void;
}

export function QuickConfigBar({
  model,
  temperature,
  mcpServers,
  onModelChange,
  onTemperatureChange,
  onMcpServersChange,
}: QuickConfigBarProps) {
  const [showServers, setShowServers] = useState(false);
  const mcpServerOptions = useMcpServerOptions();
  const summary =
    mcpServers.length === 0
      ? 'None'
      : `${mcpServers.length} server${mcpServers.length === 1 ? '' : 's'}`;

  return (
    <div className="border-b border-slate-700/45 bg-slate-900/20">
      <div className="px-4 py-2.5 flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-gray-500 uppercase tracking-wider">Model:</span>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="px-2 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          >
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-gray-500 uppercase tracking-wider">Temp:</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            className="w-24 accent-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
          />
          <span className="text-gray-300 w-8 text-right font-mono">{temperature.toFixed(1)}</span>
        </label>

        <button
          type="button"
          onClick={() => setShowServers((prev) => !prev)}
          aria-expanded={showServers}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-200 bg-slate-800/80 border border-slate-700/60 hover:border-slate-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          <Wrench className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <span className="text-gray-500 uppercase tracking-wider text-xs">MCP servers:</span>
          {summary}
          <ChevronDown
            className={clsx('w-3.5 h-3.5 transition-transform', showServers && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      {showServers && (
        <div className="px-4 pb-3">
          <McpServerPicker
            value={mcpServers}
            options={mcpServerOptions}
            onChange={onMcpServersChange}
          />
        </div>
      )}
    </div>
  );
}
