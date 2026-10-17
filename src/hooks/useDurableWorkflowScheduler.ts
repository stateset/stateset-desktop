import { useCallback, useEffect, useRef } from 'react';
import { durableWorkflowApi, type DurableWorkflowStatus } from '../lib/durableWorkflows';
import { nextScheduledRun, shouldWaitForPreviousRun } from '../lib/durableWorkflowSchedules';
import {
  getScheduleIntentGeneration,
  getWorkflowConnectionGeneration,
  useDurableWorkflowsStore,
  type PendingScheduledOccurrence,
} from '../stores/durableWorkflows';
import { useNotificationsStore } from '../stores/notifications';
import { usePreferencesStore } from '../stores/preferences';

const SCHEDULER_INTERVAL_MS = 15_000;
// Shared across hook instances, including StrictMode remounts in this renderer.
const processing = new Set<string>();

async function observeRequest<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('The engine did not respond within 45 seconds.')),
          45_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function workflowIdFor(brandId: string, requestId: string): string {
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (!uuid.test(brandId) || !uuid.test(requestId)) {
    throw new Error('A scheduled workflow requires a valid brand UUID.');
  }
  return `active-horizon-agent-${brandId.replace(/-/g, '').toLowerCase()}-${requestId.replace(/-/g, '').toLowerCase()}`;
}

function isConfirmation(value: unknown): value is DurableWorkflowStatus {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const statuses = new Set([
    'pending',
    'running',
    'paused',
    'resuming',
    'planning',
    'planner_failed',
    'executing',
    'executing_parallel',
    'rejecting',
    'completed',
    'planner_done',
    'time_budget_exhausted',
    'turn_budget_exhausted',
    'failure_budget_exhausted',
    'cancelled',
    'failed',
    'terminated',
    'timed_out',
    'checkpoint_failed',
    'dependency_deadlock',
  ]);
  return (
    typeof item.goal === 'string' &&
    typeof item.status === 'string' &&
    statuses.has(item.status) &&
    typeof item.paused === 'boolean' &&
    typeof item.cancelled === 'boolean' &&
    (item.current_task_id === null || typeof item.current_task_id === 'string') &&
    [
      'generation',
      'turns_completed',
      'failures',
      'elapsed_active_secs',
      'active_window_secs',
      'max_turns',
      'tasks_remaining',
    ].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0) &&
    Array.isArray(item.steering_notes) &&
    item.steering_notes.every((note) => typeof note === 'string')
  );
}

export function useDurableWorkflowScheduler() {
  const state = useDurableWorkflowsStore();
  const desktopNotifications = usePreferencesStore((value) => value.desktopNotifications);
  const mounted = useRef(true);
  const retryAfter = useRef(new Map<string, number>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runDueSchedules = useCallback(async () => {
    const initial = useDurableWorkflowsStore.getState();
    // Native write failures invalidate the revision even if the renderer still
    // holds an old URL/key. Wait for a confirmed connection before auto-launching.
    if (window.electronAPI?.computerChat?.getConnection && !initial.connectionRevision) return;
    if (!mounted.current || !initial.initialized || initial.configuring || !initial.apiKey) return;
    const now = new Date();
    const engineUrl = initial.engineUrl.trim().replace(/\/+$/, '');
    const generation = getWorkflowConnectionGeneration();
    const connectionMatches = () => {
      const current = useDurableWorkflowsStore.getState();
      return (
        current.initialized &&
        !current.configuring &&
        current.apiKey === initial.apiKey &&
        current.engineUrl.trim().replace(/\/+$/, '') === engineUrl &&
        current.connectionRevision === initial.connectionRevision &&
        getWorkflowConnectionGeneration() === generation
      );
    };
    const due = initial.schedules.filter((schedule) => {
      if (
        processing.has(schedule.id) ||
        schedule.pendingOccurrence?.needsAttention ||
        ((retryAfter.current.get(schedule.id) ?? 0) > now.getTime() &&
          schedule.pendingOccurrence?.needsAttention !== false)
      )
        return false;
      if (schedule.pendingOccurrence?.submitted) {
        return (
          !schedule.pendingOccurrence.needsAttention &&
          schedule.pendingOccurrence.engineUrl === engineUrl
        );
      }
      const previousStatus = initial.workflows.find(
        (workflow) => workflow.workflowId === schedule.lastWorkflowId
      )?.status;
      return (
        schedule.enabled &&
        Date.parse(schedule.nextRunAt) <= now.getTime() &&
        !shouldWaitForPreviousRun(schedule, previousStatus)
      );
    });

    await Promise.all(
      due.map(async (schedule) => {
        processing.add(schedule.id);
        const intent = getScheduleIntentGeneration(schedule.id);
        const store = () => useDurableWorkflowsStore.getState();
        let pending = schedule.pendingOccurrence;
        let posted = false;
        let markedSubmitted = false;
        const canDispatch = () =>
          mounted.current &&
          connectionMatches() &&
          getScheduleIntentGeneration(schedule.id) === intent &&
          store().schedules.some(
            (item) =>
              item.id === schedule.id &&
              item.enabled &&
              item.pendingOccurrence?.requestId === pending?.requestId
          );
        try {
          if (!pending) {
            const requestId = crypto.randomUUID();
            const claim: PendingScheduledOccurrence = {
              requestId,
              dueAt: schedule.nextRunAt,
              engineUrl,
              workflowId: workflowIdFor(schedule.brandId, requestId),
              tenantId: schedule.tenantId,
              brandId: schedule.brandId,
              goal: schedule.goal,
              definition: JSON.parse(JSON.stringify(schedule.definition)),
              claimedAt: now.toISOString(),
              submitted: false,
            };
            const claimed = await store().updateSchedule(schedule.id, (current) =>
              getScheduleIntentGeneration(schedule.id) === intent &&
              current.enabled &&
              current.nextRunAt === schedule.nextRunAt &&
              !current.pendingOccurrence
                ? { ...current, pendingOccurrence: claim, lastError: undefined }
                : null
            );
            if (!claimed) return;
            pending = claim;
          }
          const occurrence = pending;
          if (occurrence.engineUrl !== engineUrl) return;
          let details: DurableWorkflowStatus | undefined;
          let runId = '';
          if (occurrence.submitted) {
            // Temporal retention is finite: recovery checks the original identity,
            // rather than submitting another potentially executable start request.
            if (!connectionMatches()) return;
            const confirmation = await observeRequest(
              durableWorkflowApi.status(occurrence.tenantId, occurrence.workflowId)
            );
            if (!isConfirmation(confirmation) || confirmation.goal !== occurrence.goal)
              throw new Error('The engine returned an invalid run confirmation.');
            details = confirmation;
          } else {
            if (!canDispatch()) return;
            let granted = false;
            const saved = await store().updateSchedule(schedule.id, (current) => {
              if (
                !canDispatch() ||
                !current.pendingOccurrence ||
                current.pendingOccurrence.requestId !== occurrence.requestId ||
                current.pendingOccurrence.submitted
              )
                return null;
              granted = true;
              return {
                ...current,
                pendingOccurrence: { ...current.pendingOccurrence, submitted: true },
              };
            });
            if (!saved || !granted) return;
            markedSubmitted = true;
            if (!canDispatch()) {
              // This live caller can prove no POST was sent. A crashed caller
              // cannot make that assertion and must keep the confirmation state.
              await store().updateSchedule(schedule.id, (current) =>
                current.pendingOccurrence &&
                current.pendingOccurrence.requestId === occurrence.requestId
                  ? {
                      ...current,
                      pendingOccurrence:
                        getScheduleIntentGeneration(schedule.id) === intent
                          ? { ...current.pendingOccurrence, submitted: false }
                          : undefined,
                    }
                  : null
              );
              return;
            }
            posted = true;
            const result = await observeRequest(
              durableWorkflowApi.start({
                tenantId: occurrence.tenantId,
                brandId: occurrence.brandId,
                requestId: occurrence.requestId,
                goal: occurrence.goal,
                ...occurrence.definition,
              })
            );
            if (
              !result ||
              result.workflow_id !== occurrence.workflowId ||
              (result.run_id != null && typeof result.run_id !== 'string')
            ) {
              throw new Error('The engine did not confirm the expected workflow identity.');
            }
            runId = result.run_id ?? '';
          }
          if (!connectionMatches())
            throw new Error(`Reconnect to ${occurrence.engineUrl} to confirm this run.`);
          const trackedAt = new Date().toISOString();
          const existing = store().workflows.find(
            (workflow) => workflow.workflowId === occurrence.workflowId
          );
          await store().track({
            ...existing,
            workflowId: occurrence.workflowId,
            runId: runId || existing?.runId || '',
            requestId: occurrence.requestId,
            tenantId: occurrence.tenantId,
            brandId: occurrence.brandId,
            goal: occurrence.goal,
            status: details?.status ?? existing?.status ?? 'running',
            details: details ?? existing?.details,
            createdAt: existing?.createdAt ?? occurrence.claimedAt,
            updatedAt: trackedAt,
            agent: occurrence.definition.agent,
            definition: occurrence.definition,
          });
          const acknowledged = await store().updateSchedule(schedule.id, (current) => {
            if (current.pendingOccurrence?.requestId !== occurrence.requestId) return null;
            const sameOccurrence = current.nextRunAt === occurrence.dueAt;
            const nextRunAt = sameOccurrence
              ? nextScheduledRun(occurrence.dueAt, current.frequency)
              : current.nextRunAt;
            return {
              ...current,
              pendingOccurrence: undefined,
              lastError: undefined,
              lastWorkflowId: occurrence.workflowId,
              lastRunAt: occurrence.claimedAt,
              nextRunAt: nextRunAt ?? current.nextRunAt,
              enabled: current.enabled && (!sameOccurrence || nextRunAt !== null),
              updatedAt: trackedAt,
            };
          });
          if (acknowledged) {
            const title = posted ? 'Scheduled workflow started' : 'Scheduled workflow confirmed';
            useNotificationsStore
              .getState()
              .addNotification({ type: 'success', title, message: schedule.name });
            if (desktopNotifications && window.electronAPI?.notifications) {
              try {
                await window.electronAPI.notifications.show({ title, body: schedule.name });
              } catch {
                /* Notification delivery does not affect the run. */
              }
            }
          }
        } catch (error) {
          retryAfter.current.set(schedule.id, Date.now() + SCHEDULER_INTERVAL_MS);
          const detail = error instanceof Error ? error.message : String(error);
          const uncertain = posted || markedSubmitted || pending?.submitted;
          const message = uncertain
            ? `Launch could not be confirmed. Check the pending run before creating another. ${detail}`
            : detail;
          const previousError = store().schedules.find(
            (item) => item.id === schedule.id
          )?.lastError;
          try {
            await store().updateSchedule(schedule.id, (current) =>
              pending && current.pendingOccurrence?.requestId !== pending.requestId
                ? null
                : {
                    ...current,
                    lastError: message,
                    pendingOccurrence: current.pendingOccurrence
                      ? { ...current.pendingOccurrence, needsAttention: true }
                      : undefined,
                  }
            );
          } catch {
            /* Keep the persisted occurrence intact if storage is unavailable. */
          }
          if (previousError !== message)
            useNotificationsStore.getState().addNotification({
              type: 'warning',
              title: 'Scheduled workflow needs attention',
              message: `${schedule.name}: ${message}`,
            });
        } finally {
          processing.delete(schedule.id);
        }
      })
    );
  }, [desktopNotifications]);

  useEffect(() => {
    if (!state.initialized || !state.apiKey || state.configuring) return;
    void runDueSchedules();
    const intervalId = window.setInterval(() => void runDueSchedules(), SCHEDULER_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    state.initialized,
    state.apiKey,
    state.configuring,
    state.engineUrl,
    state.connectionRevision,
    state.schedules,
    state.workflows,
    runDueSchedules,
  ]);
}
