import { X, Play, Copy, Trash2 } from 'lucide-react';
import type { AgentTemplate } from '../../../types';
import { useTemplatesStore } from '../../../stores/templates';

interface TemplateDetailPanelProps {
  template: AgentTemplate;
  onClose: () => void;
  onUseTemplate: (template: AgentTemplate) => void;
}

export function TemplateDetailPanel({
  template,
  onClose,
  onUseTemplate,
}: TemplateDetailPanelProps) {
  const { addCustomTemplate, removeCustomTemplate } = useTemplatesStore();

  const handleDuplicate = async () => {
    const duplicate: AgentTemplate = {
      ...template,
      id: `custom-${Date.now()}`,
      name: `${template.name} (Copy)`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    await addCustomTemplate(duplicate);
  };

  const handleDelete = async () => {
    await removeCustomTemplate(template.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col h-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold truncate">{template.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            aria-label="Close template details"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-sm text-gray-400">{template.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded capitalize">
                {template.category}
              </span>
              <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded capitalize">
                {template.agentType}
              </span>
              {template.isCustom && (
                <span className="px-2 py-0.5 text-xs bg-brand-600/30 text-brand-300 rounded">
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* Config Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">Configuration</h3>

            <div className="grid grid-cols-2 gap-3">
              <ConfigItem label="Model" value={template.config.model || 'Default'} />
              <ConfigItem label="Temperature" value={String(template.config.temperature ?? 0.7)} />
              <ConfigItem
                label="Max Iterations"
                value={String(template.config.max_iterations ?? 100)}
              />
              <ConfigItem
                label="Loop Interval"
                value={`${template.config.loop_interval_ms ?? 1000}ms`}
              />
              <ConfigItem
                label="Timeout"
                value={`${template.config.iteration_timeout_secs ?? 300}s`}
              />
              <ConfigItem
                label="Pause on Error"
                value={template.config.pause_on_error ? 'Yes' : 'No'}
              />
            </div>
          </div>

          {/* MCP Servers */}
          {template.config.mcp_servers && template.config.mcp_servers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">MCP Servers</h3>
              <div className="flex flex-wrap gap-1.5">
                {template.config.mcp_servers.map((server) => (
                  <span
                    key={server}
                    className="px-2.5 py-1 text-xs bg-gray-800 text-gray-300 rounded-lg"
                  >
                    {server}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom Instructions */}
          {template.config.custom_instructions && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Custom Instructions</h3>
              <p className="text-sm text-gray-400 bg-gray-800 rounded-lg p-3">
                {template.config.custom_instructions}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-800 space-y-2">
          <button
            type="button"
            onClick={() => onUseTemplate(template)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            aria-label={`Use template ${template.name}`}
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Use This Template
          </button>
          <div className="flex gap-2">
            {!template.isCustom && (
              <button
                type="button"
                onClick={handleDuplicate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                aria-label={`Duplicate template ${template.name}`}
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
                Duplicate
              </button>
            )}
            {template.isCustom && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-red-900/50 hover:text-red-400 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-1"
                aria-label={`Delete template ${template.name}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}
