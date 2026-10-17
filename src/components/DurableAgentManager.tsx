import { useState } from 'react';
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from './ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { DURABLE_AGENT_EXECUTABLES, type DurableAgentProfile } from '../lib/durableAgentProfiles';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';

interface DurableAgentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (profile: DurableAgentProfile) => void;
}

const DEFAULT_TOOLS = ['rg', 'jq', 'cat', 'head', 'tail', 'wc', 'sort'];

export function DurableAgentManager({ isOpen, onClose, onCreated }: DurableAgentManagerProps) {
  const { showToast } = useToast();
  const customAgents = useDurableWorkflowsStore((state) => state.customAgents);
  const saveCustomAgent = useDurableWorkflowsStore((state) => state.saveCustomAgent);
  const removeCustomAgent = useDurableWorkflowsStore((state) => state.removeCustomAgent);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [maxIterations, setMaxIterations] = useState(10);
  const [maxTotalTokens, setMaxTotalTokens] = useState(20_000);
  const [tools, setTools] = useState<string[]>(DEFAULT_TOOLS);
  const [saving, setSaving] = useState(false);

  const toggleTool = (tool: string) => {
    setTools((current) =>
      current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool]
    );
  };

  const save = async () => {
    if (!name.trim() || !instructions.trim() || !tools.length) return;
    setSaving(true);
    try {
      const profile: DurableAgentProfile = {
        id: `custom-${crypto.randomUUID()}`,
        name: name.trim(),
        description: description.trim() || 'Custom background agent',
        provider: 'openai',
        connectorKey: 'openai-primary',
        model: 'gpt-5.4',
        systemPrompt: instructions.trim(),
        maxIterations: Math.min(50, Math.max(1, Math.floor(maxIterations))),
        allowedExecutables: tools,
        maxTokens: 1024,
        maxTotalTokens: Math.min(200_000, Math.max(1024, Math.floor(maxTotalTokens))),
      };
      await saveCustomAgent(profile);
      onCreated(profile);
      setName('');
      setDescription('');
      setInstructions('');
      setMaxIterations(10);
      setMaxTotalTokens(20_000);
      setTools(DEFAULT_TOOLS);
      showToast({
        variant: 'success',
        title: 'Agent profile created',
        message: `${profile.name} is ready for background work.`,
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to save agent',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (profile: DurableAgentProfile) => {
    const accepted = await confirm({
      title: `Remove ${profile.name}?`,
      message:
        'The saved profile will be removed. Existing workflows keep their agent snapshot and continue running.',
      confirmLabel: 'Remove profile',
      variant: 'danger',
    });
    if (!accepted) return;
    await removeCustomAgent(profile.id);
    showToast({
      variant: 'warning',
      title: 'Agent profile removed',
      message:
        'Existing workflows are unaffected. The profile cannot be recovered unless recreated.',
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Background agents"
        description="Create reusable, bounded agents for durable workflows."
        size="xl"
        preventClose={saving}
      >
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Saved agents
            </h3>
            <div className="mt-3 space-y-2">
              {customAgents.length ? (
                customAgents.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/25 p-3"
                  >
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-200">{profile.name}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">
                        {profile.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(profile)}
                      className="minimal-icon-button h-8 w-8 text-slate-600 hover:text-rose-300"
                      aria-label={`Remove ${profile.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
                  No custom agents yet
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              New agent profile
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  className="minimal-input mt-1.5 w-full"
                  placeholder="Inventory investigator"
                />
              </label>
              <label className="text-xs text-slate-400">
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={240}
                  className="minimal-input mt-1.5 w-full"
                  placeholder="Checks inventory discrepancies"
                />
              </label>
            </div>
            <label className="block text-xs text-slate-400">
              Instructions
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={12_000}
                rows={4}
                className="minimal-input mt-1.5 w-full resize-none text-xs leading-5"
                placeholder="Describe the role, operating rules, and definition of done."
              />
            </label>
            <fieldset>
              <legend className="text-xs text-slate-400">Allowed tools</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DURABLE_AGENT_EXECUTABLES.map((tool) => {
                  const selected = tools.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTool(tool)}
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                        selected
                          ? 'border-slate-500 bg-slate-700/60 text-slate-200'
                          : 'border-slate-800 text-slate-600 hover:border-slate-700'
                      }`}
                    >
                      {tool}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">
                Max actions
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxIterations}
                  onChange={(event) => setMaxIterations(Number(event.target.value))}
                  className="minimal-input mt-1.5 w-full"
                />
              </label>
              <label className="text-xs text-slate-400">
                Total token budget
                <input
                  type="number"
                  min={1024}
                  max={200000}
                  step={1024}
                  value={maxTotalTokens}
                  onChange={(event) => setMaxTotalTokens(Number(event.target.value))}
                  className="minimal-input mt-1.5 w-full"
                />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <p className="text-[11px] text-slate-600">Managed model · gpt-5.4</p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !name.trim() || !instructions.trim() || !tools.length}
                className="minimal-primary-button"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create agent
              </button>
            </div>
          </section>
        </div>
      </Modal>
      {ConfirmDialogComponent}
    </>
  );
}
