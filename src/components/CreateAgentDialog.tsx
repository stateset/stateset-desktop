import { useState, useEffect } from 'react';
import { X, Bot } from 'lucide-react';
import clsx from 'clsx';
import { TemplatePicker } from '../features/templates';
import { BUILT_IN_TEMPLATES } from '../lib/agentTemplates';
import type { AgentSessionConfig, AgentTemplate } from '../types';

interface CreateAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAgent: (agentType: string, config: Partial<AgentSessionConfig>) => void;
  isCreating: boolean;
}

export function CreateAgentDialog({
  isOpen,
  onClose,
  onCreateAgent,
  isCreating,
}: CreateAgentDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate>(BUILT_IN_TEMPLATES[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customConfig, setCustomConfig] = useState<Partial<AgentSessionConfig>>({});

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(BUILT_IN_TEMPLATES[0]);
      setShowAdvanced(false);
      setCustomConfig({});
    }
  }, [isOpen]);

  const finalConfig = { ...selectedTemplate.config, ...customConfig };

  const handleCreate = () => {
    onCreateAgent(selectedTemplate.agentType, finalConfig);
  };

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setCustomConfig({});
  };

  const updateCustomConfig = (updates: Partial<AgentSessionConfig>) => {
    setCustomConfig((prev) => ({ ...prev, ...updates }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        className="w-full max-w-3xl bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-xl animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Bot className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 id="create-agent-title" className="text-lg font-semibold">
                Create New Agent
              </h2>
              <p className="text-sm text-gray-400">Choose a template or customize your agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="group/close p-2 rounded-lg hover:bg-gray-800 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
            aria-label="Close dialog"
          >
            <X
              className="w-5 h-5 group-hover/close:rotate-90 transition-transform duration-200"
              aria-hidden="true"
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Template Picker */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Agent Templates
            </h3>
            <TemplatePicker selectedId={selectedTemplate.id} onSelect={handleSelectTemplate} />
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            type="button"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
          >
            <span className={clsx('transition-transform', showAdvanced && 'rotate-90')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
            Advanced Settings
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 backdrop-blur-sm">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm text-gray-400">Model</span>
                  <select
                    value={finalConfig.model || 'claude-sonnet-4-6'}
                    onChange={(e) => updateCustomConfig({ model: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
                  >
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Recommended)</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-gray-400">Temperature</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={finalConfig.temperature ?? 0.7}
                    onChange={(e) =>
                      updateCustomConfig({
                        temperature: Math.min(2, Math.max(0, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-gray-400">Max Iterations</span>
                  <input
                    type="number"
                    min={1}
                    value={finalConfig.max_iterations ?? 100}
                    onChange={(e) =>
                      updateCustomConfig({
                        max_iterations: Math.max(1, parseInt(e.target.value) || 1),
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-gray-400">Loop Interval (ms)</span>
                  <input
                    type="number"
                    min={100}
                    value={finalConfig.loop_interval_ms ?? 1000}
                    onChange={(e) =>
                      updateCustomConfig({
                        loop_interval_ms: Math.max(100, parseInt(e.target.value) || 100),
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-lg hover:border-gray-600 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 transition-all focus-glow"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-sm text-gray-400">Custom Instructions</span>
                <textarea
                  rows={3}
                  value={finalConfig.custom_instructions ?? ''}
                  onChange={(e) => updateCustomConfig({ custom_instructions: e.target.value })}
                  placeholder="Add specific instructions for this agent..."
                  className="w-full px-3 py-2 bg-gray-800/90 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
                />
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={finalConfig.pause_on_error ?? false}
                  onChange={(e) => updateCustomConfig({ pause_on_error: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <div>
                  <p className="text-sm font-medium">Pause on Error</p>
                  <p className="text-xs text-gray-400">
                    Stop the agent when an unrecoverable error occurs
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* MCP Warning */}
          {finalConfig.mcp_servers && finalConfig.mcp_servers.length > 0 && (
            <div className="mt-4 p-3 bg-amber-900/20 border border-amber-800 rounded-lg">
              <p className="text-sm text-amber-300">
                <strong>Note:</strong> This template uses MCP servers (
                {finalConfig.mcp_servers.join(', ')}) which require platform credentials to be
                configured in the Connections page.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700/50 bg-slate-900/60">
          <div className="text-sm text-gray-400">
            <span>
              Template: <strong>{selectedTemplate.name}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isCreating}
              type="button"
              className="px-4 py-2 bg-gray-800/90 hover:bg-gray-700 rounded-lg border border-gray-800/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-brand-600/95 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg font-medium border border-brand-600/50 transition-all duration-200 shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0 disabled:shadow-none"
            >
              {isCreating ? (
                <>
                  <div
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  Creating...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" aria-hidden="true" />
                  Create Agent
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
