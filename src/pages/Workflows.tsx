import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  Bot,
  Bookmark,
  CalendarClock,
  ChevronDown,
  Circle,
  Clock3,
  Download,
  Gauge,
  ListPlus,
  Loader2,
  Link2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { WorkflowInitializationNotice } from '../components/WorkflowInitializationNotice';
import { Modal } from '../components/Modal';
import { DurableAgentManager } from '../components/DurableAgentManager';
import { DurableWorkflowActivity } from '../components/DurableWorkflowActivity';
import { useToast } from '../components/ToastProvider';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { assertNoInlineSecrets, durableWorkflowApi } from '../lib/durableWorkflows';
import { isDurableWorkflowTerminal } from '../lib/durableWorkflowStatus';
import { downloadBlueprints, importBlueprintFile } from '../lib/durableBlueprintTransfer';
import { localDateTimeInputValue, scheduleDescription } from '../lib/durableWorkflowSchedules';
import {
  COMMAND_RUNNER_ID,
  DURABLE_AGENT_PROFILES,
  type DurableAgentProfile,
} from '../lib/durableAgentProfiles';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuthStore } from '../stores/auth';
import {
  useDurableWorkflowsStore,
  type DurableWorkflowBlueprint,
  type DurableWorkflowSchedule,
  type TrackedDurableWorkflow,
} from '../stores/durableWorkflows';

function parseSteps(value: string): string[][] {
  return value
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((step) => step.length > 0);
}

function isSuccessful(status: string) {
  return status === 'completed' || status === 'planner_done';
}

function statusColor(status: string) {
  if (isSuccessful(status)) return 'bg-emerald-400';
  if (status === 'paused') return 'bg-amber-400';
  if (status === 'failed' || status.includes('exhausted')) return 'bg-rose-400';
  if (status === 'cancelled') return 'bg-slate-500';
  return 'bg-blue-400';
}

function startedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Started previously'
    : `Started ${formatDistanceToNow(date, { addSuffix: true })}`;
}

function workflowAgentLabel(workflow: TrackedDurableWorkflow): string {
  const assigned = workflow.definition?.stepAgents;
  if (assigned?.length) {
    const names = new Set(assigned.map((agent) => agent?.name ?? 'Command runner'));
    return names.size === 1 ? [...names][0] : `${names.size} agents`;
  }
  return workflow.agent?.name ?? 'Command runner';
}

type WorkflowFilter = 'all' | 'active' | 'attention' | 'completed';

function needsAttention(workflow: TrackedDurableWorkflow): boolean {
  return (
    workflow.status === 'failed' ||
    workflow.status.includes('exhausted') ||
    Boolean(workflow.lastError)
  );
}

async function persistWorkflowError(workflowId: string, message: string): Promise<string | null> {
  try {
    await useDurableWorkflowsStore.getState().setError(workflowId, message);
    return null;
  } catch (error) {
    return `Local details could not be saved: ${error instanceof Error ? error.message : String(error)} Refresh this workflow after resolving the error.`;
  }
}

function matchesWorkflowFilter(
  workflow: TrackedDurableWorkflow,
  filter: WorkflowFilter,
  query: string
): boolean {
  const matchesState =
    filter === 'all' ||
    (filter === 'active' && !isDurableWorkflowTerminal(workflow.status)) ||
    (filter === 'attention' && needsAttention(workflow)) ||
    (filter === 'completed' && isSuccessful(workflow.status));
  if (!matchesState) return false;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [workflow.goal, workflow.workflowId, workflow.status, workflowAgentLabel(workflow)].some(
    (value) => value.toLowerCase().includes(normalizedQuery)
  );
}

function displayedScheduleDescription(
  schedule: DurableWorkflowSchedule,
  workflows: TrackedDurableWorkflow[]
): string {
  if (schedule.pendingOccurrence) return scheduleDescription(schedule);
  if (schedule.lastError) return schedule.lastError;
  const previous = workflows.find((workflow) => workflow.workflowId === schedule.lastWorkflowId);
  if (
    !schedule.allowOverlap &&
    schedule.enabled &&
    previous &&
    !isDurableWorkflowTerminal(previous.status) &&
    Date.parse(schedule.nextRunAt) <= Date.now()
  ) {
    return 'Waiting for the previous run to finish';
  }
  return scheduleDescription(schedule);
}

interface IconActionProps {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}

function IconAction({ label, icon: Icon, onClick, busy = false, danger = false }: IconActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)] ${danger ? 'hover:text-rose-300' : ''}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

interface CompactNumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function CompactNumber({ label, value, min, max, onChange }: CompactNumberProps) {
  return (
    <label className="text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="minimal-input mt-1 w-full text-sm normal-case"
      />
    </label>
  );
}

function WorkflowRow({
  workflow,
  onRunAgain,
}: {
  workflow: TrackedDurableWorkflow;
  onRunAgain: (workflow: TrackedDurableWorkflow) => void;
}) {
  const { updateStatus, markStatus, remove } = useDurableWorkflowsStore();
  const { showToast } = useToast();
  const { confirm: confirmRowAction, ConfirmDialogComponent: RowConfirmDialog } =
    useConfirmDialog();
  const [expanded, setExpanded] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [steerNote, setSteerNote] = useState('');
  const [newStep, setNewStep] = useState('');
  const [newStepTimeout, setNewStepTimeout] = useState(10);
  const [extraMinutes, setExtraMinutes] = useState(60);
  const [extraTurns, setExtraTurns] = useState(1);
  const [extraFailures, setExtraFailures] = useState(0);
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const [queueDirty, setQueueDirty] = useState(false);
  const terminal = isDurableWorkflowTerminal(workflow.status);
  const details = workflow.details;
  const progress = details?.max_turns
    ? Math.min(100, Math.round((details.turns_completed / details.max_turns) * 100))
    : 0;
  const pendingOriginalTaskIds = useMemo(() => {
    const completedTurns = details?.turns_completed ?? 0;
    return (workflow.definition?.steps ?? [])
      .map((_, index) => ({ id: `desktop-step-${index + 1}`, index }))
      .filter((task) => task.index >= completedTurns && task.id !== details?.current_task_id)
      .map((task) => task.id);
  }, [details?.current_task_id, details?.turns_completed, workflow.definition?.steps]);

  useEffect(() => {
    setQueueOrder((current) => [
      ...current.filter((taskId) => pendingOriginalTaskIds.includes(taskId)),
      ...pendingOriginalTaskIds.filter((taskId) => !current.includes(taskId)),
    ]);
  }, [pendingOriginalTaskIds]);

  const refreshStatus = async () => {
    const status = await durableWorkflowApi.status(workflow.tenantId, workflow.workflowId);
    await updateStatus(workflow.workflowId, status);
  };

  const runAction = async (name: string, action: () => Promise<unknown>, success?: string) => {
    setBusyAction(name);
    let accepted = false;
    try {
      await action();
      accepted = true;
      await refreshStatus();
      if (success) showToast({ variant: 'success', title: success, message: workflow.goal });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const saveError = await persistWorkflowError(workflow.workflowId, message);
      showToast({
        variant: accepted ? 'warning' : 'error',
        title: accepted ? 'Action accepted; status needs attention' : 'Workflow action failed',
        message: `${accepted ? 'The engine accepted this action. Refresh its status before sending it again. ' : ''}${message}${saveError ? ` ${saveError}` : ''}`,
      });
      // Clear accepted command drafts even if saving/refetching status failed.
      // Retrying the draft would create a distinct enqueue request.
      return accepted;
    } finally {
      setBusyAction(null);
    }
  };

  const sendSteering = async () => {
    const note = steerNote.trim();
    if (!note) return;
    const succeeded = await runAction(
      'steer',
      () => durableWorkflowApi.steer(workflow.tenantId, workflow.workflowId, note),
      'Guidance sent'
    );
    if (succeeded) setSteerNote('');
  };

  const enqueueStep = async () => {
    const commands = newStep
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!commands.length) return;
    const succeeded = await runAction(
      'enqueue',
      () =>
        durableWorkflowApi.enqueueStep({
          tenantId: workflow.tenantId,
          workflowId: workflow.workflowId,
          requestId: crypto.randomUUID(),
          goal: `${workflow.goal} — added step`,
          commands,
          timeoutSeconds: newStepTimeout * 60,
          agent: workflow.agent,
        }),
      'Step added'
    );
    if (succeeded) setNewStep('');
  };

  const extendBudget = () =>
    runAction(
      'budget',
      () =>
        durableWorkflowApi.extendBudget({
          tenantId: workflow.tenantId,
          workflowId: workflow.workflowId,
          additionalWindowSeconds: extraMinutes * 60,
          additionalTurns: extraTurns,
          additionalFailures: extraFailures,
        }),
      'Budget extended'
    );

  const moveQueuedTask = (taskId: string, offset: -1 | 1) => {
    setQueueOrder((current) => {
      const index = current.indexOf(taskId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setQueueDirty(true);
  };

  const applyQueueOrder = async () => {
    if (!queueOrder.length || !queueDirty) return;
    const succeeded = await runAction(
      'reprioritize',
      () => durableWorkflowApi.reprioritize(workflow.tenantId, workflow.workflowId, queueOrder),
      'Queue updated'
    );
    if (succeeded) setQueueDirty(false);
  };

  const cancelWorkflow = async () => {
    const accepted = await confirmRowAction({
      title: `Cancel ${workflow.goal}?`,
      message:
        'The workflow and its current child task will receive a durable cancellation request. This cannot be resumed.',
      confirmLabel: 'Cancel workflow',
      variant: 'danger',
    });
    if (!accepted) return;
    await runAction(
      'cancel',
      () => durableWorkflowApi.signal(workflow.tenantId, workflow.workflowId, 'cancel'),
      'Cancellation requested'
    );
  };

  const terminateWorkflow = async () => {
    const accepted = await confirmRowAction({
      title: `Force stop ${workflow.goal}?`,
      message:
        'This immediately terminates the workflow at the engine. Use it only when graceful cancellation cannot complete.',
      confirmLabel: 'Force stop workflow',
      variant: 'danger',
    });
    if (!accepted) return;
    setBusyAction('terminate');
    let terminated = false;
    try {
      await durableWorkflowApi.terminate(workflow.tenantId, workflow.workflowId);
      terminated = true;
      await markStatus(workflow.workflowId, 'terminated');
      showToast({
        variant: 'warning',
        title: 'Workflow force stopped',
        message: workflow.goal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const saveError = await persistWorkflowError(workflow.workflowId, message);
      showToast({
        variant: terminated ? 'warning' : 'error',
        title: terminated
          ? 'Workflow stopped; local status needs attention'
          : 'Unable to force stop workflow',
        message: `${terminated ? 'The engine confirmed termination. ' : ''}${message}${saveError ? ` ${saveError}` : ''}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const removeWorkflow = async () => {
    setBusyAction('remove');
    try {
      await remove(workflow.workflowId);
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to remove workflow',
        message: `${error instanceof Error ? error.message : String(error)} Retry removing it after resolving the error.`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <article className="group border-b border-[var(--ui-border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-[var(--ui-surface-hover)] focus-visible:bg-[var(--ui-surface-hover)] focus-visible:outline-none"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-4">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            {!terminal && workflow.status !== 'paused' && (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${statusColor(workflow.status)}`}
              />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusColor(workflow.status)}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ui-text)]">{workflow.goal}</p>
            <p className="mt-1 truncate text-xs text-[var(--ui-muted)]">
              {details?.current_task_id
                ? `${workflowAgentLabel(workflow)} · Running ${details.current_task_id}`
                : `${workflowAgentLabel(workflow)} · ${startedLabel(workflow.createdAt)}`}
            </p>
          </div>
          <div className="hidden w-36 sm:block">
            <div className="mb-1.5 flex justify-between text-[11px] text-[var(--ui-muted)]">
              <span>
                {details
                  ? `${details.turns_completed}/${details.max_turns} turns`
                  : 'Waiting for status'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--ui-surface-selected)]">
              <div
                className="h-full rounded-full bg-slate-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="w-28 text-right text-xs capitalize text-[var(--ui-muted)]">
            {workflow.status.replace(/_/g, ' ')}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--ui-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pl-11">
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <IconAction
                label="Refresh"
                busy={busyAction === 'refresh'}
                onClick={() => void runAction('refresh', async () => undefined)}
                icon={RefreshCw}
              />
              {!terminal && (details?.paused || workflow.status === 'paused') ? (
                <IconAction
                  label="Resume"
                  busy={busyAction === 'resume'}
                  onClick={() =>
                    void runAction('resume', () =>
                      durableWorkflowApi.signal(workflow.tenantId, workflow.workflowId, 'resume')
                    )
                  }
                  icon={Play}
                />
              ) : !terminal ? (
                <IconAction
                  label="Pause"
                  busy={busyAction === 'pause'}
                  onClick={() =>
                    void runAction('pause', () =>
                      durableWorkflowApi.signal(workflow.tenantId, workflow.workflowId, 'pause')
                    )
                  }
                  icon={Pause}
                />
              ) : null}
              {!terminal && (
                <>
                  <IconAction
                    label="Cancel"
                    busy={busyAction === 'cancel'}
                    onClick={() => void cancelWorkflow()}
                    icon={Square}
                    danger
                  />
                  <IconAction
                    label="Force stop"
                    busy={busyAction === 'terminate'}
                    onClick={() => void terminateWorkflow()}
                    icon={Ban}
                    danger
                  />
                </>
              )}
              {terminal && (
                <>
                  {workflow.definition && (
                    <IconAction
                      label="Run again"
                      onClick={() => onRunAgain(workflow)}
                      icon={RefreshCw}
                    />
                  )}
                  <IconAction
                    label="Remove"
                    busy={busyAction === 'remove'}
                    onClick={() => void removeWorkflow()}
                    icon={Trash2}
                    danger
                  />
                </>
              )}
              <span
                className="ml-auto hidden font-mono text-[10px] text-[var(--ui-muted)] md:block"
                title={workflow.workflowId}
              >
                {workflow.workflowId}
              </span>
            </div>

            {workflow.lastError && (
              <div className="mt-3 flex gap-2 rounded-lg bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {workflow.lastError}
              </div>
            )}

            <DurableWorkflowActivity
              tenantId={workflow.tenantId}
              workflowId={workflow.workflowId}
            />

            {!terminal && (
              <>
                <div className="mt-4 flex gap-2">
                  <input
                    value={steerNote}
                    onChange={(event) => setSteerNote(event.target.value)}
                    maxLength={500}
                    placeholder="Guide the running workflow…"
                    className="minimal-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void sendSteering()}
                    disabled={!steerNote.trim() || busyAction !== null}
                    className="minimal-icon-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                    aria-label="Send guidance"
                  >
                    {busyAction === 'steer' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <details className="mt-4 border-t border-[var(--ui-border)] pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-[var(--ui-muted)] hover:text-[var(--ui-text)]">
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Adjust workflow
                  </summary>
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-medium text-[var(--ui-text)]">
                        <ListPlus className="h-4 w-4" /> Add durable step
                      </p>
                      <textarea
                        value={newStep}
                        onChange={(event) => setNewStep(event.target.value)}
                        rows={3}
                        placeholder="One command per line"
                        className="minimal-input mt-2 w-full resize-none font-mono text-xs"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <label className="text-[11px] text-[var(--ui-muted)]">
                          Timeout
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={newStepTimeout}
                            onChange={(event) => setNewStepTimeout(Number(event.target.value))}
                            className="minimal-number-input"
                          />
                          min
                        </label>
                        <button
                          type="button"
                          onClick={() => void enqueueStep()}
                          disabled={!newStep.trim() || busyAction !== null}
                          className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                        >
                          Add step
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-xs font-medium text-[var(--ui-text)]">
                        <Gauge className="h-4 w-4" /> Extend budget
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <CompactNumber
                          label="Minutes"
                          value={extraMinutes}
                          min={0}
                          max={1440}
                          onChange={setExtraMinutes}
                        />
                        <CompactNumber
                          label="Turns"
                          value={extraTurns}
                          min={0}
                          max={500}
                          onChange={setExtraTurns}
                        />
                        <CompactNumber
                          label="Failures"
                          value={extraFailures}
                          min={0}
                          max={100}
                          onChange={setExtraFailures}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void extendBudget()}
                        disabled={
                          busyAction !== null ||
                          (extraMinutes <= 0 && extraTurns <= 0 && extraFailures <= 0)
                        }
                        className="minimal-secondary-button mt-3 ml-auto block text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                      >
                        Extend budget
                      </button>
                    </div>
                    {queueOrder.length > 0 && workflow.definition && (
                      <div className="border-t border-[var(--ui-border)] pt-4 lg:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-[var(--ui-text)]">
                              Upcoming handoffs
                            </p>
                            <p className="mt-1 text-[10px] text-[var(--ui-muted)]">
                              Reorder original steps that have not started. Added steps remain in
                              the engine queue.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void applyQueueOrder()}
                            disabled={!queueDirty || busyAction !== null}
                            className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                          >
                            {busyAction === 'reprioritize' && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            Apply order
                          </button>
                        </div>
                        <ol className="mt-3 space-y-1.5">
                          {queueOrder.map((taskId, queueIndex) => {
                            const stepIndex = Number(taskId.replace('desktop-step-', '')) - 1;
                            const step = workflow.definition?.steps[stepIndex];
                            const assignedAgent =
                              workflow.definition?.stepAgents?.[stepIndex] ??
                              workflow.definition?.agent;
                            return (
                              <li
                                key={taskId}
                                className="flex items-center gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"
                              >
                                <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                                  Step {stepIndex + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-mono text-[11px] text-[var(--ui-muted)]">
                                    {step?.[0] ?? taskId}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-[var(--ui-muted)]">
                                    {assignedAgent?.name ?? 'Command runner'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => moveQueuedTask(taskId, -1)}
                                  disabled={queueIndex === 0 || busyAction !== null}
                                  className="minimal-icon-button h-7 w-7 text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                                  aria-label={`Move step ${stepIndex + 1} up`}
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveQueuedTask(taskId, 1)}
                                  disabled={
                                    queueIndex === queueOrder.length - 1 || busyAction !== null
                                  }
                                  className="minimal-icon-button h-7 w-7 text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                                  aria-label={`Move step ${stepIndex + 1} down`}
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      )}
      {RowConfirmDialog}
    </article>
  );
}

export default function Workflows() {
  usePageTitle('Workflows');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const tenant = useAuthStore((state) => state.tenant);
  const brand = useAuthStore((state) => state.currentBrand);
  const {
    initialized,
    engineUrl,
    apiKey,
    configuring,
    workflows,
    customAgents,
    blueprints,
    schedules,
    initialize,
    track,
    saveBlueprint,
    removeBlueprint,
    updateStatus,
    saveSchedule,
    updateSchedule: updateStoredSchedule,
    removeSchedule,
  } = useDurableWorkflowsStore();
  const [showForm, setShowForm] = useState(false);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [workflowId, setWorkflowId] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [goal, setGoal] = useState('');
  const [commands, setCommands] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<DurableAgentProfile | undefined>();
  const [stepAgentOverrides, setStepAgentOverrides] = useState<
    Record<number, DurableAgentProfile | null | undefined>
  >({});
  const [activeMinutes, setActiveMinutes] = useState(60);
  const [timeoutMinutes, setTimeoutMinutes] = useState(10);
  const [maxFailures, setMaxFailures] = useState(3);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [blueprintName, setBlueprintName] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('all');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [fleetAction, setFleetAction] = useState<'pause' | 'resume' | 'cancel' | null>(null);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() =>
    localDateTimeInputValue(new Date(Date.now() + 5 * 60_000))
  );
  const [scheduleFrequency, setScheduleFrequency] = useState<'once' | 'daily' | 'weekly'>('once');
  const [allowScheduleOverlap, setAllowScheduleOverlap] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DurableWorkflowSchedule | null>(null);
  const [editScheduleName, setEditScheduleName] = useState('');
  const [editScheduleAt, setEditScheduleAt] = useState('');
  const [editScheduleFrequency, setEditScheduleFrequency] = useState<'once' | 'daily' | 'weekly'>(
    'once'
  );
  const [editScheduleEnabled, setEditScheduleEnabled] = useState(true);
  const [editScheduleOverlap, setEditScheduleOverlap] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const checkingSchedules = useRef(new Set<string>());
  const [checkingScheduleIds, setCheckingScheduleIds] = useState<Set<string>>(new Set());
  const blueprintFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => void initialize(), [initialize]);

  const parsedSteps = useMemo(() => parseSteps(commands), [commands]);
  const availableAgents = useMemo(() => {
    const candidates = [
      ...DURABLE_AGENT_PROFILES,
      ...customAgents,
      selectedAgent,
      ...Object.values(stepAgentOverrides),
    ].filter((profile): profile is DurableAgentProfile => Boolean(profile));
    return [...new Map(candidates.map((profile) => [profile.id, profile])).values()];
  }, [customAgents, selectedAgent, stepAgentOverrides]);

  const visible = useMemo(
    () => workflows.filter((item) => !tenant?.id || item.tenantId === tenant.id),
    [tenant?.id, workflows]
  );
  const filteredWorkflows = useMemo(
    () =>
      visible.filter((workflow) => matchesWorkflowFilter(workflow, workflowFilter, workflowQuery)),
    [visible, workflowFilter, workflowQuery]
  );
  const activeCount = visible.filter((item) => !isDurableWorkflowTerminal(item.status)).length;
  const completeCount = visible.filter((item) => isSuccessful(item.status)).length;
  const attentionCount = visible.filter(needsAttention).length;
  const pausedWorkflows = visible.filter(
    (item) =>
      !isDurableWorkflowTerminal(item.status) &&
      (item.status === 'paused' || Boolean(item.details?.paused))
  );
  const runningWorkflows = visible.filter(
    (item) =>
      !isDurableWorkflowTerminal(item.status) && item.status !== 'paused' && !item.details?.paused
  );
  const visibleSchedules = schedules.filter(
    (schedule) => !tenant?.id || schedule.tenantId === tenant.id
  );

  const runFleetAction = async (action: 'pause' | 'resume' | 'cancel') => {
    const targets =
      action === 'resume'
        ? pausedWorkflows
        : action === 'cancel'
          ? [...runningWorkflows, ...pausedWorkflows]
          : runningWorkflows;
    if (!targets.length || fleetAction) return;
    if (action === 'cancel') {
      const accepted = await confirm({
        title: `Cancel ${targets.length} active workflow${targets.length === 1 ? '' : 's'}?`,
        message: 'Running tasks will receive a durable cancellation signal and cannot be resumed.',
        confirmLabel: 'Cancel workflows',
        variant: 'danger',
      });
      if (!accepted) return;
    }

    setFleetAction(action);
    let succeeded = 0;
    const saveErrors = new Set<string>();
    const recordError = async (workflowId: string, message: string) => {
      const saveError = await persistWorkflowError(workflowId, message);
      if (saveError) saveErrors.add(saveError);
    };
    try {
      for (let index = 0; index < targets.length; index += 5) {
        const batch = targets.slice(index, index + 5);
        await Promise.all(
          batch.map(async (workflow) => {
            try {
              await durableWorkflowApi.signal(workflow.tenantId, workflow.workflowId, action);
              succeeded += 1;
              try {
                const status = await durableWorkflowApi.status(
                  workflow.tenantId,
                  workflow.workflowId
                );
                await updateStatus(workflow.workflowId, status);
              } catch (refreshError) {
                await recordError(
                  workflow.workflowId,
                  `Action accepted; status refresh failed: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`
                );
              }
            } catch (actionError) {
              await recordError(
                workflow.workflowId,
                actionError instanceof Error ? actionError.message : String(actionError)
              );
            }
          })
        );
      }
      const failed = targets.length - succeeded;
      const completedVerb = { pause: 'paused', resume: 'resumed', cancel: 'cancelled' }[action];
      showToast({
        variant: failed || saveErrors.size ? 'warning' : 'success',
        title: failed ? 'Fleet action partially completed' : `Workflows ${completedVerb}`,
        message:
          (failed
            ? `${succeeded} succeeded and ${failed} failed. Open the affected workflows for details.`
            : `${succeeded} workflow${succeeded === 1 ? '' : 's'} ${completedVerb}.`) +
          (saveErrors.size ? ` ${[...saveErrors][0]}` : ''),
      });
    } finally {
      setFleetAction(null);
    }
  };

  const start = async () => {
    const steps = parsedSteps;
    const agent = selectedAgent;
    const stepAgents = steps.map((_, index) =>
      Object.prototype.hasOwnProperty.call(stepAgentOverrides, index)
        ? (stepAgentOverrides[index] ?? null)
        : (agent ?? null)
    );
    if (!tenant?.id || !brand?.id || !goal.trim() || !steps.length) return;
    setIsStarting(true);
    let confirmedLaunch: { workflowId: string; requestId: string } | null = null;
    try {
      const requestId = crypto.randomUUID();
      const result = await durableWorkflowApi.start({
        tenantId: tenant.id,
        brandId: brand.id,
        requestId,
        goal: goal.trim(),
        steps,
        activeWindowSeconds: activeMinutes * 60,
        maxFailures,
        perCommandTimeoutSeconds: timeoutMinutes * 60,
        agent,
        stepAgents,
      });
      const confirmedId = typeof result.workflow_id === 'string' ? result.workflow_id.trim() : '';
      if (!confirmedId) throw new Error('The workflow engine did not return a workflow ID.');
      confirmedLaunch = { workflowId: confirmedId, requestId };
      // A confirmed engine launch must not remain available for a fresh start
      // merely because this desktop cannot persist its tracking record.
      setGoal('');
      setCommands('');
      setSelectedAgent(undefined);
      setStepAgentOverrides({});
      setShowForm(false);
      const now = new Date().toISOString();
      await track({
        workflowId: confirmedLaunch.workflowId,
        runId: result.run_id ?? '',
        requestId: confirmedLaunch.requestId,
        tenantId: tenant.id,
        brandId: brand.id,
        goal: goal.trim(),
        status: 'running',
        createdAt: now,
        updatedAt: now,
        agent,
        definition: {
          steps,
          activeWindowSeconds: activeMinutes * 60,
          maxFailures,
          perCommandTimeoutSeconds: timeoutMinutes * 60,
          agent,
          stepAgents,
        },
      });
      showToast({
        variant: 'success',
        title: 'Workflow started',
        message: 'Temporal is running it in the background.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (confirmedLaunch) {
        setWorkflowId(confirmedLaunch.workflowId);
        setShowAttachForm(true);
        showToast({
          variant: 'warning',
          title: 'Workflow started; tracking needs attention',
          message: `${confirmedLaunch.workflowId} started, but tracking could not be saved: ${message} Track the existing ID to recover this run.`,
        });
      } else {
        showToast({ variant: 'error', title: 'Unable to start workflow', message });
      }
    } finally {
      setIsStarting(false);
    }
  };

  const scheduleCurrentWorkflow = async () => {
    const steps = parsedSteps;
    if (!tenant?.id || !brand?.id || !goal.trim() || !steps.length || !scheduleAt) return;
    const scheduledDate = new Date(scheduleAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      showToast({
        variant: 'error',
        title: 'Invalid schedule',
        message: 'Choose a valid run time.',
      });
      return;
    }
    setIsScheduling(true);
    try {
      assertNoInlineSecrets(steps);
      const stepAgents = steps.map((_, index) =>
        Object.prototype.hasOwnProperty.call(stepAgentOverrides, index)
          ? (stepAgentOverrides[index] ?? null)
          : (selectedAgent ?? null)
      );
      const now = new Date().toISOString();
      await saveSchedule({
        id: `schedule-${crypto.randomUUID()}`,
        name: scheduleName.trim() || goal.trim(),
        tenantId: tenant.id,
        brandId: brand.id,
        goal: goal.trim(),
        definition: {
          steps,
          activeWindowSeconds: activeMinutes * 60,
          maxFailures,
          perCommandTimeoutSeconds: timeoutMinutes * 60,
          agent: selectedAgent,
          stepAgents,
        },
        frequency: scheduleFrequency,
        allowOverlap: allowScheduleOverlap,
        nextRunAt: scheduledDate.toISOString(),
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
      setShowForm(false);
      setScheduleName('');
      setAllowScheduleOverlap(false);
      showToast({
        variant: 'success',
        title: 'Workflow scheduled',
        message: 'StateSet Desktop will launch it while running in the tray.',
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to save schedule',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const updateSchedule = async (
    schedule: DurableWorkflowSchedule,
    updates: Partial<DurableWorkflowSchedule>
  ): Promise<boolean> => {
    // User edits must use public save so a prepared launch observes the new
    // intent. Merge into the latest row, retaining any frozen submitted run.
    const current = useDurableWorkflowsStore
      .getState()
      .schedules.find((item) => item.id === schedule.id);
    if (!current) {
      showToast({
        variant: 'warning',
        title: 'Schedule no longer available',
        message: 'Choose an existing schedule before making changes.',
      });
      return false;
    }
    try {
      await saveSchedule({
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to update schedule',
        message: `${error instanceof Error ? error.message : String(error)} Retry saving this schedule.`,
      });
      return false;
    }
  };

  const checkPendingRun = async (schedule: DurableWorkflowSchedule) => {
    const { id: scheduleId, pendingOccurrence } = schedule;
    if (!pendingOccurrence) return;
    if (checkingSchedules.current.has(scheduleId)) return;
    checkingSchedules.current.add(scheduleId);
    setCheckingScheduleIds(new Set(checkingSchedules.current));
    try {
      await updateStoredSchedule(scheduleId, (current) =>
        current.pendingOccurrence?.requestId === pendingOccurrence.requestId &&
        current.pendingOccurrence.submitted === pendingOccurrence.submitted &&
        (current.pendingOccurrence.submitted || current.pendingOccurrence.needsAttention)
          ? {
              ...current,
              pendingOccurrence: { ...current.pendingOccurrence, needsAttention: false },
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            }
          : null
      );
    } catch (error) {
      showToast({
        variant: 'error',
        title: pendingOccurrence.submitted
          ? 'Unable to check pending run'
          : 'Unable to retry scheduled run',
        message: `${error instanceof Error ? error.message : String(error)} Try again after resolving the error.`,
      });
    } finally {
      checkingSchedules.current.delete(scheduleId);
      setCheckingScheduleIds(new Set(checkingSchedules.current));
    }
  };

  const openScheduleEditor = (schedule: DurableWorkflowSchedule) => {
    setEditingSchedule(schedule);
    setEditScheduleName(schedule.name);
    setEditScheduleAt(localDateTimeInputValue(new Date(schedule.nextRunAt)));
    setEditScheduleFrequency(schedule.frequency);
    setEditScheduleEnabled(schedule.enabled);
    setEditScheduleOverlap(Boolean(schedule.allowOverlap));
  };

  const saveScheduleChanges = async () => {
    if (!editingSchedule || !editScheduleName.trim() || !editScheduleAt) return;
    const nextRun = new Date(editScheduleAt);
    if (Number.isNaN(nextRun.getTime())) {
      showToast({
        variant: 'error',
        title: 'Invalid schedule',
        message: 'Choose a valid run time.',
      });
      return;
    }
    setIsSavingSchedule(true);
    try {
      // Only persist edited fields. A launch can advance or pause the current
      // schedule while this dialog still contains its original timing.
      const updates: Partial<DurableWorkflowSchedule> = {};
      if (editScheduleName.trim() !== editingSchedule.name) updates.name = editScheduleName.trim();
      if (editScheduleFrequency !== editingSchedule.frequency)
        updates.frequency = editScheduleFrequency;
      if (editScheduleAt !== localDateTimeInputValue(new Date(editingSchedule.nextRunAt)))
        updates.nextRunAt = nextRun.toISOString();
      if (editScheduleEnabled !== editingSchedule.enabled) updates.enabled = editScheduleEnabled;
      if (editScheduleOverlap !== Boolean(editingSchedule.allowOverlap))
        updates.allowOverlap = editScheduleOverlap;
      if (Object.keys(updates).length === 0) {
        setEditingSchedule(null);
        return;
      }
      const saved = await updateSchedule(editingSchedule, updates);
      if (!saved) return;
      setEditingSchedule(null);
      showToast({
        variant: 'success',
        title: 'Schedule updated',
        message: 'Future workflow launches will use the new timing.',
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to update schedule',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const deleteSchedule = async (schedule: DurableWorkflowSchedule) => {
    const accepted = await confirm({
      title: `Delete ${schedule.name}?`,
      message: 'Future launches from this desktop will stop. Existing workflows are unaffected.',
      confirmLabel: 'Delete schedule',
      variant: 'danger',
    });
    if (!accepted) return;
    try {
      await removeSchedule(schedule.id);
      showToast({
        variant: 'warning',
        title: 'Schedule deleted',
        message: 'The schedule cannot be recovered unless recreated.',
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to delete schedule',
        message: `${error instanceof Error ? error.message : String(error)} Check any pending run before trying again.`,
      });
    }
  };

  const attach = async () => {
    const id = workflowId.trim();
    if (!tenant?.id || !brand?.id || !id) return;
    setIsAttaching(true);
    try {
      const details = await durableWorkflowApi.status(tenant.id, id);
      const now = new Date().toISOString();
      await track({
        workflowId: id,
        runId: '',
        requestId: '',
        tenantId: tenant.id,
        brandId: brand.id,
        goal: details.goal,
        status: details.status,
        createdAt: now,
        updatedAt: now,
        details,
      });
      setWorkflowId('');
      setShowAttachForm(false);
      showToast({
        variant: 'success',
        title: 'Workflow added',
        message: 'This desktop will keep its status in sync.',
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to find workflow',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsAttaching(false);
    }
  };

  const runAgain = (workflow: TrackedDurableWorkflow) => {
    if (!workflow.definition) return;
    setGoal(workflow.goal);
    setCommands(workflow.definition.steps.map((step) => step.join('\n')).join('\n\n'));
    setActiveMinutes(Math.max(5, Math.round(workflow.definition.activeWindowSeconds / 60)));
    setTimeoutMinutes(Math.max(1, Math.round(workflow.definition.perCommandTimeoutSeconds / 60)));
    setMaxFailures(workflow.definition.maxFailures);
    setSelectedAgent(workflow.definition.agent);
    setStepAgentOverrides(
      Object.fromEntries(
        (workflow.definition.stepAgents ?? []).map((agent, index) => [index, agent])
      )
    );
    setShowForm(true);
  };

  const applyBlueprint = (blueprint: DurableWorkflowBlueprint) => {
    setSelectedBlueprintId(blueprint.id);
    setBlueprintName(blueprint.name);
    setGoal(blueprint.goal);
    setCommands(blueprint.definition.steps.map((step) => step.join('\n')).join('\n\n'));
    setActiveMinutes(Math.round(blueprint.definition.activeWindowSeconds / 60));
    setTimeoutMinutes(Math.round(blueprint.definition.perCommandTimeoutSeconds / 60));
    setMaxFailures(blueprint.definition.maxFailures);
    setSelectedAgent(blueprint.definition.agent);
    setStepAgentOverrides(
      Object.fromEntries(
        (blueprint.definition.stepAgents ?? []).map((agent, index) => [index, agent])
      )
    );
  };

  const saveCurrentBlueprint = async () => {
    const name = blueprintName.trim();
    if (!name || !goal.trim() || !parsedSteps.length) return;
    try {
      assertNoInlineSecrets(parsedSteps);
      const now = new Date().toISOString();
      const existing = blueprints.find((item) => item.id === selectedBlueprintId);
      const stepAgents = parsedSteps.map((_, index) =>
        Object.prototype.hasOwnProperty.call(stepAgentOverrides, index)
          ? (stepAgentOverrides[index] ?? null)
          : (selectedAgent ?? null)
      );
      const blueprint: DurableWorkflowBlueprint = {
        id: existing?.id ?? `blueprint-${crypto.randomUUID()}`,
        name,
        goal: goal.trim(),
        definition: {
          steps: parsedSteps,
          activeWindowSeconds: activeMinutes * 60,
          maxFailures,
          perCommandTimeoutSeconds: timeoutMinutes * 60,
          agent: selectedAgent,
          stepAgents,
        },
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveBlueprint(blueprint);
      setSelectedBlueprintId(blueprint.id);
      showToast({
        variant: 'success',
        title: existing ? 'Blueprint updated' : 'Blueprint saved',
        message: `${blueprint.name} is ready to reuse.`,
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to save blueprint',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const deleteSelectedBlueprint = async () => {
    const blueprint = blueprints.find((item) => item.id === selectedBlueprintId);
    if (!blueprint) return;
    const accepted = await confirm({
      title: `Delete ${blueprint.name}?`,
      message: 'This removes the saved blueprint. Existing workflows are unaffected.',
      confirmLabel: 'Delete blueprint',
      variant: 'danger',
    });
    if (!accepted) return;
    await removeBlueprint(blueprint.id);
    setSelectedBlueprintId('');
    setBlueprintName('');
    showToast({
      variant: 'warning',
      title: 'Blueprint deleted',
      message: 'It cannot be recovered unless recreated. Existing workflows are unaffected.',
    });
  };

  const importBlueprints = async (file: File) => {
    try {
      const imported = await importBlueprintFile(file);
      for (const blueprint of imported) await saveBlueprint(blueprint);
      showToast({
        variant: 'success',
        title: 'Blueprints imported',
        message: `${imported.length} reusable workflow${imported.length === 1 ? '' : 's'} added.`,
      });
    } catch (error) {
      showToast({
        variant: 'error',
        title: 'Unable to import blueprints',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (blueprintFileInputRef.current) blueprintFileInputRef.current.value = '';
    }
  };

  if (!initialized) {
    return (
      <div className="page-shell mx-auto max-w-5xl">
        <WorkflowInitializationNotice />
      </div>
    );
  }

  return (
    <div className="page-shell mx-auto max-w-5xl space-y-6">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ui-muted)]">
            <Circle
              className={`h-2 w-2 fill-current ${apiKey ? 'text-emerald-400' : 'text-[var(--ui-muted)]'}`}
            />
            Durable execution
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-text)]">Workflows</h1>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Long-running work, safely detached from this device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAgentManager(true)}
            disabled={!apiKey}
            className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
          >
            <Bot className="h-4 w-4" /> Agents
          </button>
          <button
            type="button"
            onClick={() => setShowAttachForm(true)}
            disabled={!apiKey}
            className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
          >
            <Link2 className="h-4 w-4" /> Track existing
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={!apiKey}
            className="ui-button ui-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> New workflow
          </button>
        </div>
      </header>

      {!apiKey && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--ui-warning)]">
              Connect the workflow engine
            </p>
            <p className="mt-0.5 text-xs text-[var(--ui-muted)]">Add a secure API key to begin.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings?tab=background')}
            className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
          >
            Open settings
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 divide-x divide-[var(--ui-border)] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <Metric label="Active" value={activeCount} />
        <Metric label="Completed" value={completeCount} />
        <Metric label="Needs attention" value={attentionCount} />
      </div>

      {visibleSchedules.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-3">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Schedules
            </h2>
            <span className="text-xs text-[var(--ui-muted)]">Desktop managed</span>
          </div>
          {visibleSchedules.map((schedule) => (
            <div
              key={schedule.id}
              role="group"
              aria-label={`Schedule ${schedule.name}`}
              className="space-y-3 border-b border-[var(--ui-border)] px-5 py-4 last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    schedule.lastError || schedule.pendingOccurrence?.needsAttention
                      ? 'bg-rose-400'
                      : schedule.enabled
                        ? 'bg-blue-400'
                        : 'bg-slate-600'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-5 text-[var(--ui-text)] [overflow-wrap:anywhere]">
                    {schedule.name}
                  </p>
                  <p
                    id={`${schedule.id}-status`}
                    className="mt-1 text-xs leading-5 text-[var(--ui-muted)] [overflow-wrap:anywhere]"
                  >
                    {displayedScheduleDescription(schedule, workflows)}
                  </p>
                  {schedule.pendingOccurrence?.submitted && (
                    <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
                      Check the pending run before deleting this schedule.
                    </p>
                  )}
                  {schedule.pendingOccurrence && schedule.lastError && (
                    <p className="mt-1 text-xs leading-5 text-[var(--ui-warning)] [overflow-wrap:anywhere]">
                      {schedule.lastError}
                    </p>
                  )}
                  {schedule.pendingOccurrence &&
                    schedule.pendingOccurrence.engineUrl !== engineUrl && (
                      <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)] [overflow-wrap:anywhere]">
                        Pending run belongs to {schedule.pendingOccurrence.engineUrl}. Restore that
                        connection to check it.
                      </p>
                    )}
                </div>
              </div>
              <div
                role="group"
                aria-label={`Actions for ${schedule.name}`}
                className="flex flex-wrap items-center gap-x-1 gap-y-2 pl-5"
              >
                {schedule.pendingOccurrence &&
                  (schedule.pendingOccurrence.submitted ||
                    schedule.pendingOccurrence.needsAttention) && (
                    <button
                      type="button"
                      disabled={
                        !apiKey ||
                        configuring ||
                        (!schedule.pendingOccurrence.submitted && !schedule.enabled) ||
                        checkingScheduleIds.has(schedule.id) ||
                        (schedule.pendingOccurrence.submitted &&
                          schedule.pendingOccurrence.needsAttention === false) ||
                        schedule.pendingOccurrence.engineUrl !== engineUrl
                      }
                      aria-busy={
                        checkingScheduleIds.has(schedule.id) ||
                        (schedule.pendingOccurrence.submitted &&
                          schedule.pendingOccurrence.needsAttention === false) ||
                        undefined
                      }
                      aria-describedby={`${schedule.id}-status`}
                      title={
                        !apiKey || configuring
                          ? 'Finish configuring the workflow connection before continuing.'
                          : !schedule.pendingOccurrence.submitted && !schedule.enabled
                            ? 'Resume the schedule before retrying this unsent run.'
                            : schedule.pendingOccurrence.engineUrl !== engineUrl
                              ? 'Restore the original workflow connection before checking.'
                              : schedule.pendingOccurrence.submitted
                                ? 'Refresh the submitted run’s status.'
                                : 'Retry the prepared run using its existing identity.'
                      }
                      onClick={() => void checkPendingRun(schedule)}
                      className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${checkingScheduleIds.has(schedule.id) ? 'animate-spin motion-reduce:animate-none' : ''}`}
                        aria-hidden="true"
                      />
                      {checkingScheduleIds.has(schedule.id)
                        ? 'Saving…'
                        : schedule.pendingOccurrence.submitted &&
                            schedule.pendingOccurrence.needsAttention === false
                          ? 'Checking…'
                          : schedule.pendingOccurrence.submitted
                            ? 'Check pending run'
                            : 'Retry scheduled run'}
                    </button>
                  )}
                <button
                  type="button"
                  disabled={Boolean(schedule.pendingOccurrence)}
                  title={
                    schedule.pendingOccurrence
                      ? 'Confirm the pending run before requesting another.'
                      : undefined
                  }
                  onClick={() =>
                    void updateSchedule(schedule, {
                      enabled: true,
                      nextRunAt: new Date().toISOString(),
                      lastError: undefined,
                    })
                  }
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  <Play className="h-3.5 w-3.5" /> Run now
                </button>
                <button
                  type="button"
                  onClick={() => void updateSchedule(schedule, { enabled: !schedule.enabled })}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  {schedule.enabled ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {schedule.enabled ? 'Pause' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void updateSchedule(schedule, { allowOverlap: !schedule.allowOverlap })
                  }
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                  title="Control whether another scheduled run may start while the previous run is active"
                >
                  {schedule.allowOverlap ? 'Overlap allowed' : 'Sequential'}
                </button>
                <button
                  type="button"
                  onClick={() => openScheduleEditor(schedule)}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSchedule(schedule)}
                  className="minimal-icon-button h-8 w-8 border-[var(--ui-border)] text-[var(--ui-muted)] hover:text-[var(--ui-negative)]"
                  aria-label={`Delete ${schedule.name}`}
                  disabled={Boolean(schedule.pendingOccurrence?.submitted)}
                  title={
                    schedule.pendingOccurrence?.submitted
                      ? 'Check the pending run before deleting this schedule.'
                      : undefined
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <p className="px-5 py-2.5 text-[11px] leading-5 text-[var(--ui-muted)]">
            Schedules launch while StateSet Desktop is running, including when minimized to the
            tray. Submitted runs are checked even while a schedule is paused.
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ui-border)] px-5 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">
            Recent workflows
          </h2>
          <div className="ml-auto flex min-w-56 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ui-muted)]" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search workflows"
              value={workflowQuery}
              onChange={(event) => setWorkflowQuery(event.target.value)}
              placeholder="Search workflows"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-muted)]"
            />
          </div>
          <span className="text-xs tabular-nums text-[var(--ui-muted)]">
            {filteredWorkflows.length}/{visible.length}
          </span>
        </div>
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--ui-border)] px-4 py-2.5">
            {(
              [
                ['all', 'All', visible.length],
                ['active', 'Active', activeCount],
                ['attention', 'Attention', attentionCount],
                ['completed', 'Completed', completeCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setWorkflowFilter(value)}
                aria-pressed={workflowFilter === value}
                className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                  workflowFilter === value
                    ? 'bg-[var(--ui-surface-selected)] text-[var(--ui-text)]'
                    : 'text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-muted)]'
                }`}
              >
                {label} <span className="ml-1 tabular-nums opacity-60">{count}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => void runFleetAction('pause')}
                  disabled={fleetAction !== null}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  {fleetAction === 'pause' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                  Pause active
                </button>
              )}
              {pausedWorkflows.length > 0 && (
                <button
                  type="button"
                  onClick={() => void runFleetAction('resume')}
                  disabled={fleetAction !== null}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  {fleetAction === 'resume' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Resume paused
                </button>
              )}
              {runningWorkflows.length > 0 && (
                <button
                  type="button"
                  onClick={() => void runFleetAction('cancel')}
                  disabled={fleetAction !== null}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-negative)]"
                >
                  {fleetAction === 'cancel' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  Cancel active
                </button>
              )}
            </div>
          </div>
        )}
        {filteredWorkflows.length ? (
          filteredWorkflows.map((workflow) => (
            <WorkflowRow key={workflow.workflowId} workflow={workflow} onRunAgain={runAgain} />
          ))
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <Clock3 className="mx-auto h-7 w-7 text-[var(--ui-muted)]" />
            <p className="mt-3 text-sm text-[var(--ui-muted)]">No workflows yet</p>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Create one when you have work that should outlive this app.
            </p>
          </div>
        ) : (
          <div className="py-12 text-center">
            <Search className="mx-auto h-6 w-6 text-[var(--ui-muted)]" />
            <p className="mt-3 text-sm text-[var(--ui-muted)]">No matching workflows</p>
            <button
              type="button"
              onClick={() => {
                setWorkflowFilter('all');
                setWorkflowQuery('');
              }}
              className="minimal-action mx-auto mt-2 text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="New background workflow"
        description="Blank lines separate durable steps."
        size="xl"
        preventClose={isStarting}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ui-muted)]">
              Reusable blueprints
            </p>
            <div className="flex items-center gap-1">
              <input
                ref={blueprintFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import workflow blueprints"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBlueprints(file);
                }}
              />
              <button
                type="button"
                onClick={() => blueprintFileInputRef.current?.click()}
                className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
              >
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              {blueprints.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadBlueprints(blueprints)}
                  className="minimal-action text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] hover:text-[var(--ui-text)]"
                >
                  <Download className="h-3.5 w-3.5" /> Export all
                </button>
              )}
            </div>
          </div>
          {blueprints.length > 0 && (
            <div className="flex items-end gap-2">
              <label className="block flex-1 text-xs font-medium text-[var(--ui-muted)]">
                Blueprint
                <select
                  aria-label="Workflow blueprint"
                  value={selectedBlueprintId}
                  onChange={(event) => {
                    const blueprint = blueprints.find((item) => item.id === event.target.value);
                    if (blueprint) applyBlueprint(blueprint);
                    else setSelectedBlueprintId('');
                  }}
                  className="minimal-input mt-1.5 w-full"
                >
                  <option value="">Start from scratch</option>
                  {blueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>
                      {blueprint.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedBlueprintId && (
                <button
                  type="button"
                  onClick={() => void deleteSelectedBlueprint()}
                  className="minimal-icon-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
                  aria-label="Delete selected blueprint"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <label className="block text-xs font-medium text-[var(--ui-muted)]">
            Goal
            <input
              autoFocus
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="minimal-input mt-1.5 w-full text-sm"
              placeholder="Reconcile yesterday's order export"
            />
          </label>
          <fieldset>
            <legend className="text-xs font-medium text-[var(--ui-muted)]">Agent</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2" role="radiogroup">
              <AgentOption
                id={COMMAND_RUNNER_ID}
                name="Command runner"
                description="Executes only the commands you provide. No model-driven actions."
                selected={!selectedAgent}
                onSelect={() => setSelectedAgent(undefined)}
              />
              {[...DURABLE_AGENT_PROFILES, ...customAgents].map((profile) => (
                <AgentOption
                  key={profile.id}
                  id={profile.id}
                  name={profile.name}
                  description={profile.description}
                  selected={selectedAgent?.id === profile.id}
                  onSelect={() => setSelectedAgent(profile)}
                />
              ))}
            </div>
            {selectedAgent && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--ui-muted)]">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" /> Uses a managed model with bounded
                actions and token limits.
              </p>
            )}
          </fieldset>
          <label className="block text-xs font-medium text-[var(--ui-muted)]">
            Commands
            <textarea
              value={commands}
              onChange={(event) => setCommands(event.target.value)}
              rows={7}
              className="minimal-input mt-1.5 w-full resize-none font-mono text-xs leading-5"
              placeholder={
                "curl -fsS https://example.com/input.csv -o /tmp/input.csv\npython /workspace/reconcile.py /tmp/input.csv\n\nprintf '%s' 'next durable step'"
              }
            />
          </label>
          {parsedSteps.length > 1 && (
            <details>
              <summary className="cursor-pointer text-xs text-[var(--ui-muted)] hover:text-[var(--ui-text)]">
                Assign agents to steps
              </summary>
              <div className="mt-3 space-y-2">
                {parsedSteps.map((step, index) => {
                  const override = stepAgentOverrides[index];
                  const hasOverride = Object.prototype.hasOwnProperty.call(
                    stepAgentOverrides,
                    index
                  );
                  const value = hasOverride
                    ? override?.id || COMMAND_RUNNER_ID
                    : 'workflow-default';
                  return (
                    <div
                      key={`${index}-${step[0]}`}
                      className="flex items-center gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"
                    >
                      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                        Step {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--ui-muted)]">
                        {step[0]}
                      </span>
                      <select
                        aria-label={`Agent for step ${index + 1}`}
                        value={value}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setStepAgentOverrides((current) => {
                            const next = { ...current };
                            if (nextValue === 'workflow-default') delete next[index];
                            else if (nextValue === COMMAND_RUNNER_ID) next[index] = null;
                            else {
                              next[index] = availableAgents.find(
                                (profile) => profile.id === nextValue
                              );
                            }
                            return next;
                          });
                        }}
                        className="minimal-input w-44 py-1.5 text-xs"
                      >
                        <option value="workflow-default">
                          Default · {selectedAgent?.name ?? 'Command runner'}
                        </option>
                        {selectedAgent && <option value={COMMAND_RUNNER_ID}>Command runner</option>}
                        {availableAgents.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[var(--ui-muted)]">
                Steps execute durably in order. Each handoff starts a fresh isolated sandbox.
              </p>
            </details>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-[var(--ui-muted)] hover:text-[var(--ui-text)]">
              Execution limits
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <CompactNumber
                label="Window (min)"
                value={activeMinutes}
                min={5}
                max={1440}
                onChange={setActiveMinutes}
              />
              <CompactNumber
                label="Step timeout"
                value={timeoutMinutes}
                min={1}
                max={30}
                onChange={setTimeoutMinutes}
              />
              <CompactNumber
                label="Failures"
                value={maxFailures}
                min={1}
                max={100}
                onChange={setMaxFailures}
              />
            </div>
          </details>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-text)]">
              <CalendarClock className="h-3.5 w-3.5" /> Schedule for later
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] sm:items-end">
              <label className="text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                Name
                <input
                  aria-label="Schedule name"
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  maxLength={80}
                  placeholder={goal.trim() || 'Scheduled workflow'}
                  className="minimal-input mt-1 w-full text-xs normal-case"
                />
              </label>
              <label className="text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                First run
                <input
                  type="datetime-local"
                  aria-label="First run"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="minimal-input mt-1 w-full text-xs normal-case"
                />
              </label>
              <label className="text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                Repeat
                <select
                  aria-label="Schedule frequency"
                  value={scheduleFrequency}
                  onChange={(event) =>
                    setScheduleFrequency(event.target.value as 'once' | 'daily' | 'weekly')
                  }
                  className="minimal-input mt-1 w-full text-xs normal-case"
                >
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void scheduleCurrentWorkflow()}
                disabled={isScheduling || !goal.trim() || !commands.trim() || !scheduleAt}
                className="minimal-secondary-button h-9 text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
              >
                {isScheduling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="h-3.5 w-3.5" />
                )}
                Schedule
              </button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-[11px] text-[var(--ui-muted)]">
              <input
                type="checkbox"
                aria-label="Allow overlapping runs"
                checked={allowScheduleOverlap}
                onChange={(event) => setAllowScheduleOverlap(event.target.checked)}
                className="mt-0.5 rounded border-[var(--ui-border)] bg-[var(--ui-surface)]"
              />
              Allow another scheduled run to start while the previous run is still active.
            </label>
            <p className="mt-2 text-[10px] text-[var(--ui-muted)]">
              The workflow definition is snapshotted now. StateSet Desktop must be running when it
              is due.
            </p>
          </details>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-[var(--ui-muted)] hover:text-[var(--ui-text)]">
              <Bookmark className="h-3.5 w-3.5" /> Save as reusable blueprint
            </summary>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Blueprint name"
                value={blueprintName}
                onChange={(event) => setBlueprintName(event.target.value)}
                maxLength={80}
                className="minimal-input flex-1"
                placeholder="Weekly inventory review"
              />
              <button
                type="button"
                onClick={() => void saveCurrentBlueprint()}
                disabled={!blueprintName.trim() || !goal.trim() || !commands.trim()}
                className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
              >
                Save blueprint
              </button>
            </div>
          </details>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={start}
              disabled={isStarting || !goal.trim() || !commands.trim()}
              className="ui-button ui-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start workflow
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAttachForm}
        onClose={() => setShowAttachForm(false)}
        title="Track existing workflow"
        description="Add a durable workflow started from another StateSet client."
        size="md"
        preventClose={isAttaching}
      >
        <div className="space-y-5">
          <label className="block text-xs font-medium text-[var(--ui-muted)]">
            Workflow ID
            <input
              autoFocus
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && workflowId.trim()) void attach();
              }}
              className="minimal-input mt-1.5 w-full font-mono text-xs"
              placeholder="active-horizon-agent-…"
            />
          </label>
          <p className="text-xs leading-5 text-[var(--ui-muted)]">
            Access is checked by the workflow engine. Only workflows visible to your current tenant
            can be added.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAttachForm(false)}
              className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void attach()}
              disabled={isAttaching || !workflowId.trim()}
              className="ui-button ui-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed"
            >
              {isAttaching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Track workflow
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(editingSchedule)}
        onClose={() => setEditingSchedule(null)}
        title="Edit schedule"
        description="Update future launches without changing the snapshotted workflow."
        size="md"
        preventClose={isSavingSchedule}
      >
        <div className="space-y-4">
          <label className="block text-xs font-medium text-[var(--ui-muted)]">
            Name
            <input
              autoFocus
              aria-label="Edit schedule name"
              value={editScheduleName}
              onChange={(event) => setEditScheduleName(event.target.value)}
              maxLength={80}
              className="minimal-input mt-1.5 w-full"
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <label className="block text-xs font-medium text-[var(--ui-muted)]">
              Next run
              <input
                type="datetime-local"
                aria-label="Edit next run"
                value={editScheduleAt}
                onChange={(event) => setEditScheduleAt(event.target.value)}
                className="minimal-input mt-1.5 w-full text-xs"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--ui-muted)]">
              Repeat
              <select
                aria-label="Edit schedule frequency"
                value={editScheduleFrequency}
                onChange={(event) =>
                  setEditScheduleFrequency(event.target.value as 'once' | 'daily' | 'weekly')
                }
                className="minimal-input mt-1.5 w-full text-xs"
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          </div>
          <div className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
            <label className="flex items-start gap-2 text-xs text-[var(--ui-muted)]">
              <input
                type="checkbox"
                aria-label="Schedule enabled"
                checked={editScheduleEnabled}
                onChange={(event) => setEditScheduleEnabled(event.target.checked)}
                className="mt-0.5 rounded border-[var(--ui-border)] bg-[var(--ui-surface)]"
              />
              <span>
                Enabled
                <span className="mt-0.5 block text-[10px] text-[var(--ui-muted)]">
                  Launch when the next run becomes due.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[var(--ui-muted)]">
              <input
                type="checkbox"
                aria-label="Edit allow overlapping runs"
                checked={editScheduleOverlap}
                onChange={(event) => setEditScheduleOverlap(event.target.checked)}
                className="mt-0.5 rounded border-[var(--ui-border)] bg-[var(--ui-surface)]"
              />
              <span>
                Allow overlapping runs
                <span className="mt-0.5 block text-[10px] text-[var(--ui-muted)]">
                  Start even when the prior scheduled workflow is still active.
                </span>
              </span>
            </label>
          </div>
          <p className="text-[10px] leading-4 text-[var(--ui-muted)]">
            Commands, agent assignments, limits, and credentials policy remain unchanged.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingSchedule(null)}
              className="minimal-secondary-button text-[var(--ui-muted)] hover:bg-[var(--ui-surface-hover)] border-[var(--ui-border)] hover:text-[var(--ui-text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveScheduleChanges()}
              disabled={isSavingSchedule || !editScheduleName.trim() || !editScheduleAt}
              className="ui-button ui-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed"
            >
              {isSavingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </Modal>

      <DurableAgentManager
        isOpen={showAgentManager}
        onClose={() => setShowAgentManager(false)}
        onCreated={(profile) => {
          setSelectedAgent(profile);
          setShowAgentManager(false);
          setShowForm(true);
        }}
      />
      {ConfirmDialogComponent}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-4">
      <p className="text-2xl font-medium tabular-nums text-[var(--ui-text)]">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--ui-muted)]">{label}</p>
    </div>
  );
}

function AgentOption({
  id,
  name,
  description,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      data-agent-id={id}
      aria-checked={selected}
      onClick={onSelect}
      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? 'border-[var(--ui-focus)] bg-[var(--ui-surface-selected)] text-[var(--ui-text)]'
          : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-muted)] hover:border-[var(--ui-border)]'
      }`}
    >
      <span className="block text-xs font-medium">{name}</span>
      <span className="mt-1 block text-[11px] leading-4 text-[var(--ui-muted)]">{description}</span>
    </button>
  );
}
