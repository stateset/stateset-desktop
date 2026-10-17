import { useEffect, useId, useRef, useState } from 'react';
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from './ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import {
  DURABLE_AGENT_EXECUTABLES,
  DURABLE_AGENT_PROMPT_MAX_BYTES,
  type DurableAgentProfile,
} from '../lib/durableAgentProfiles';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { WorkflowInitializationNotice } from './WorkflowInitializationNotice';

interface DurableAgentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (profile: DurableAgentProfile) => void;
}

const DEFAULT_TOOLS = ['rg', 'jq', 'cat', 'head', 'tail', 'wc', 'sort'];
const PROFILE_INPUT_CLASS =
  'mt-1.5 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-xs text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-muted)] focus:border-[var(--ui-focus)] disabled:opacity-50';

export function DurableAgentManager({ isOpen, onClose, onCreated }: DurableAgentManagerProps) {
  const { showToast } = useToast();
  const initialized = useDurableWorkflowsStore((state) => state.initialized);
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
  const [action, setAction] = useState<'save' | 'confirm-remove' | 'remove' | null>(null);
  const actionInFlight = useRef(false);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const instructionsId = useId();
  const instructionsBytes = new TextEncoder().encode(instructions.trim()).length;
  const instructionsError =
    instructionsBytes > DURABLE_AGENT_PROMPT_MAX_BYTES
      ? `Instructions use ${instructionsBytes.toLocaleString()} UTF-8 bytes. Shorten them to ${DURABLE_AGENT_PROMPT_MAX_BYTES.toLocaleString()} bytes or fewer.`
      : null;
  const busy = action !== null;
  const disabled = !initialized || busy;

  useEffect(() => {
    if (!isOpen) {
      actionTrigger.current = null;
      return;
    }
    if (action === 'save' || action === 'remove') statusRef.current?.focus();
    else if (action === null && actionTrigger.current) {
      const target = actionTrigger.current.isConnected ? actionTrigger.current : nameRef.current;
      target?.focus();
      actionTrigger.current = null;
    }
  }, [action, isOpen]);

  const beginAction = (next: 'save' | 'confirm-remove') => {
    if (actionInFlight.current || !useDurableWorkflowsStore.getState().initialized) return false;
    const active = document.activeElement;
    actionTrigger.current =
      active instanceof HTMLElement && nameRef.current?.closest('[role="dialog"]')?.contains(active)
        ? active
        : nameRef.current;
    actionInFlight.current = true;
    setAction(next);
    return true;
  };

  const finishAction = () => {
    actionInFlight.current = false;
    setAction(null);
  };

  const toggleTool = (tool: string) => {
    setTools((current) =>
      current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool]
    );
  };

  const save = async () => {
    if (
      !name.trim() ||
      !instructions.trim() ||
      instructionsError ||
      !tools.length ||
      !beginAction('save')
    )
      return;
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
      finishAction();
    }
  };

  const remove = async (profile: DurableAgentProfile) => {
    if (!beginAction('confirm-remove')) return;
    try {
      const accepted = await confirm({
        title: `Remove ${profile.name}?`,
        message:
          'The saved profile will be removed. Existing workflows keep their agent snapshot and continue running.',
        confirmLabel: 'Remove profile',
        variant: 'danger',
      });
      if (!accepted) return;
      setAction('remove');
      await removeCustomAgent(profile.id);
      showToast({
        variant: 'warning',
        title: 'Agent profile removed',
        message:
          'Existing workflows are unaffected. The profile cannot be recovered unless recreated.',
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to remove agent',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      finishAction();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Background agents"
        description="Create reusable, bounded agents for durable workflows."
        size="xl"
        preventClose={busy}
      >
        <WorkflowInitializationNotice />
        {(action === 'save' || action === 'remove') && (
          <p
            ref={statusRef}
            role="status"
            tabIndex={0}
            className="mb-4 rounded-md text-xs text-[var(--ui-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
          >
            {action === 'save' ? 'Creating agent…' : 'Removing profile…'}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">
              Saved agents
            </h3>
            <div className="mt-3 space-y-2">
              {customAgents.length ? (
                customAgents.map((profile) => (
                  <article
                    key={profile.id}
                    aria-label={`Agent profile ${profile.name}`}
                    className="flex items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3"
                  >
                    <Bot
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-muted)]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-medium text-[var(--ui-text)]">
                        {profile.name}
                      </p>
                      <p className="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-[var(--ui-muted)]">
                        {profile.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(profile)}
                      disabled={disabled}
                      className="minimal-icon-button h-8 w-8 shrink-0 text-[var(--ui-muted)] hover:text-[var(--ui-negative)]"
                      aria-label={`Remove ${profile.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--ui-border)] px-4 py-8 text-center text-xs text-[var(--ui-muted)]">
                  {initialized
                    ? 'No custom agents yet'
                    : 'Saved agents are unavailable until settings load.'}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">
              New agent profile
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--ui-muted)]">
                Name
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  disabled={disabled}
                  className={PROFILE_INPUT_CLASS}
                  placeholder="Inventory investigator"
                />
              </label>
              <label className="text-xs text-[var(--ui-muted)]">
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={240}
                  disabled={disabled}
                  className={PROFILE_INPUT_CLASS}
                  placeholder="Checks inventory discrepancies"
                />
              </label>
            </div>
            <div>
              <label htmlFor={instructionsId} className="block text-xs text-[var(--ui-muted)]">
                Instructions
              </label>
              <textarea
                id={instructionsId}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                aria-invalid={Boolean(instructionsError)}
                aria-describedby={`${instructionsId}-limit${instructionsError ? ` ${instructionsId}-error` : ''}`}
                disabled={disabled}
                rows={4}
                className={`${PROFILE_INPUT_CLASS} resize-none leading-5`}
                placeholder="Describe the role, operating rules, and definition of done."
              />
              <p id={`${instructionsId}-limit`} className="mt-1.5 text-xs text-[var(--ui-muted)]">
                {instructionsBytes.toLocaleString()} /{' '}
                {DURABLE_AGENT_PROMPT_MAX_BYTES.toLocaleString()} bytes
              </p>
              {instructionsError && (
                <p
                  id={`${instructionsId}-error`}
                  role="alert"
                  className="mt-1 text-xs text-[var(--ui-negative)]"
                >
                  {instructionsError}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="text-xs text-[var(--ui-muted)]">Allowed tools</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DURABLE_AGENT_EXECUTABLES.map((tool) => {
                  const selected = tools.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => toggleTool(tool)}
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                        selected
                          ? 'border-[var(--ui-focus)] bg-[var(--ui-surface-selected)] text-[var(--ui-text)]'
                          : 'border-[var(--ui-border)] text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)]'
                      }`}
                    >
                      {tool}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--ui-muted)]">
                Max actions
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxIterations}
                  disabled={disabled}
                  onChange={(event) => setMaxIterations(Number(event.target.value))}
                  className={PROFILE_INPUT_CLASS}
                />
              </label>
              <label className="text-xs text-[var(--ui-muted)]">
                Total token budget
                <input
                  type="number"
                  min={1024}
                  max={200000}
                  step={1024}
                  value={maxTotalTokens}
                  disabled={disabled}
                  onChange={(event) => setMaxTotalTokens(Number(event.target.value))}
                  className={PROFILE_INPUT_CLASS}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-4">
              <p className="text-[11px] text-[var(--ui-muted)]">Managed model · gpt-5.4</p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={
                  disabled ||
                  !name.trim() ||
                  !instructions.trim() ||
                  Boolean(instructionsError) ||
                  !tools.length
                }
                aria-busy={action === 'save'}
                className="ui-button ui-button-primary inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium"
              >
                {action === 'save' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
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
