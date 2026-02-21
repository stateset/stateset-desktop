import type { AgentSessionConfig } from '../../../types';
import { Modal } from '../../../components/Modal';
import { Button } from '../../../components/Button';

interface ConfigModalProps {
  configDraft: AgentSessionConfig | null;
  isPending: boolean;
  onUpdate: (updates: Partial<AgentSessionConfig>) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function ConfigModal({
  configDraft,
  isPending,
  onUpdate,
  onSave,
  onReset,
  onClose,
}: ConfigModalProps) {
  const inputClass =
    'w-full px-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 focus-visible:border-brand-400/80 transition-all';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Agent Settings"
      description="Changes apply on the next agent loop."
      size="xl"
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Loop Interval (ms)</span>
            <input
              type="number"
              min={100}
              value={configDraft?.loop_interval_ms ?? 1000}
              onChange={(e) =>
                onUpdate({ loop_interval_ms: Math.max(100, Number(e.target.value) || 100) })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Max Iterations</span>
            <input
              type="number"
              min={1}
              value={configDraft?.max_iterations ?? 1}
              onChange={(e) =>
                onUpdate({ max_iterations: Math.max(1, Number(e.target.value) || 1) })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Iteration Timeout (s)</span>
            <input
              type="number"
              min={1}
              value={configDraft?.iteration_timeout_secs ?? 1}
              onChange={(e) =>
                onUpdate({ iteration_timeout_secs: Math.max(1, Number(e.target.value) || 1) })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-400">Temperature</span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={configDraft?.temperature ?? 0}
              onChange={(e) =>
                onUpdate({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })
              }
              className={inputClass}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-400">Model</span>
            <input
              type="text"
              value={configDraft?.model ?? ''}
              onChange={(e) => onUpdate({ model: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">MCP Servers (comma or newline separated)</span>
          <textarea
            rows={3}
            value={(configDraft?.mcp_servers || []).join('\n')}
            onChange={(e) =>
              onUpdate({
                mcp_servers: e.target.value
                  .split(/[,\n]/)
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
            className={`${inputClass} min-h-24`}
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-sm text-slate-400">Custom Instructions</span>
          <textarea
            rows={4}
            value={configDraft?.custom_instructions ?? ''}
            onChange={(e) => onUpdate({ custom_instructions: e.target.value })}
            className={`${inputClass} min-h-28`}
          />
        </label>

        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Pause on Error</p>
            <p className="text-sm text-slate-400">
              Stop the agent if an unrecoverable error occurs.
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            checked={configDraft?.pause_on_error ?? false}
            onChange={(e) => onUpdate({ pause_on_error: e.target.checked })}
          />
        </label>
      </div>

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800">
        <Button variant="ghost" onClick={onReset} size="sm">
          Reset to current
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!configDraft} loading={isPending}>
            Save Settings
          </Button>
        </div>
      </div>
    </Modal>
  );
}
