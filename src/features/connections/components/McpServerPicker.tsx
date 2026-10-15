import { useState } from 'react';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';
import type { McpServerOption } from '../hooks/useMcpServerOptions';

interface McpServerPickerProps {
  value: string[];
  options: McpServerOption[];
  onChange: (next: string[]) => void;
}

function buildTitle(option: McpServerOption): string {
  const lines = [
    option.connected ? option.id : `${option.id} — connect it on the Connections page`,
  ];
  if (option.tools?.length) {
    lines.push(`Tools: ${option.tools.slice(0, 8).join(', ')}`);
  }
  return lines.join('\n');
}

export function McpServerPicker({ value, options, onChange }: McpServerPickerProps) {
  const [customId, setCustomId] = useState('');
  const selected = new Set(value);
  const optionIds = new Set(options.map((option) => option.id));
  const unlistedIds = value.filter((id) => !optionIds.has(id));

  const toggle = (id: string) => {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const addCustom = () => {
    const ids = customId
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const additions = ids.filter((id, index) => !selected.has(id) && ids.indexOf(id) === index);
    setCustomId('');
    if (additions.length > 0) {
      onChange([...value, ...additions]);
    }
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-gray-300 mb-2">MCP Servers</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(option.id)}
              title={buildTitle(option)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                isSelected
                  ? 'bg-brand-600/20 border-brand-500/60 text-brand-200'
                  : 'bg-slate-900/80 border-slate-700 text-gray-300 hover:border-slate-500'
              )}
            >
              {isSelected && <Check className="w-3 h-3" aria-hidden="true" />}
              {option.name}
              {option.toolCount !== undefined && (
                <span className="text-gray-500">
                  · {option.toolCount} {option.toolCount === 1 ? 'tool' : 'tools'}
                </span>
              )}
              {!option.connected && <span className="text-amber-400/90">· not connected</span>}
            </button>
          );
        })}
        {unlistedIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs border bg-brand-600/20 border-brand-500/60 text-brand-200"
          >
            {id}
            <button
              type="button"
              onClick={() => toggle(id)}
              aria-label={`Remove ${id}`}
              className="p-0.5 rounded-full hover:bg-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customId}
          aria-label="Add server by id"
          placeholder="Add server by id"
          onChange={(e) => setCustomId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          className="flex-1 px-3 py-1.5 text-sm bg-slate-900/80 border border-slate-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:border-brand-400/80"
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}
