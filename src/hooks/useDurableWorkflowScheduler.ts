import { useCallback, useEffect, useRef } from 'react';
import { durableWorkflowApi } from '../lib/durableWorkflows';
import { nextScheduledRun, shouldWaitForPreviousRun } from '../lib/durableWorkflowSchedules';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { useNotificationsStore } from '../stores/notifications';
import { usePreferencesStore } from '../stores/preferences';

const SCHEDULER_INTERVAL_MS = 15_000;

export function useDurableWorkflowScheduler() {
  const initialized = useDurableWorkflowsStore((state) => state.initialized);
  const apiKey = useDurableWorkflowsStore((state) => state.apiKey);
  const schedules = useDurableWorkflowsStore((state) => state.schedules);
  const workflows = useDurableWorkflowsStore((state) => state.workflows);
  const saveSchedule = useDurableWorkflowsStore((state) => state.saveSchedule);
  const track = useDurableWorkflowsStore((state) => state.track);
  const desktopNotifications = usePreferencesStore((state) => state.desktopNotifications);
  const processing = useRef(new Set<string>());

  const runDueSchedules = useCallback(async () => {
    if (!initialized || !apiKey) return;
    const now = new Date();
    const due = schedules.filter((schedule) => {
      const previousStatus = workflows.find(
        (workflow) => workflow.workflowId === schedule.lastWorkflowId
      )?.status;
      return (
        schedule.enabled &&
        !processing.current.has(schedule.id) &&
        Date.parse(schedule.nextRunAt) <= now.getTime() &&
        !shouldWaitForPreviousRun(schedule, previousStatus)
      );
    });

    await Promise.all(
      due.map(async (schedule) => {
        processing.current.add(schedule.id);
        let launchedWorkflowId: string | null = null;
        const attemptAt = new Date().toISOString();
        const nextRunAt = nextScheduledRun(schedule.nextRunAt, schedule.frequency, now);
        const claimed = {
          ...schedule,
          enabled: nextRunAt !== null,
          nextRunAt: nextRunAt ?? schedule.nextRunAt,
          lastRunAt: attemptAt,
          lastError: undefined,
          updatedAt: attemptAt,
        };

        try {
          // Persist the claimed occurrence before launching. A crash after this
          // point cannot cause the same occurrence to be started twice.
          await saveSchedule(claimed);
          const requestId = crypto.randomUUID();
          const result = await durableWorkflowApi.start({
            tenantId: schedule.tenantId,
            brandId: schedule.brandId,
            requestId,
            goal: schedule.goal,
            ...schedule.definition,
          });
          launchedWorkflowId = result.workflow_id;
          const trackedAt = new Date().toISOString();
          await track({
            workflowId: result.workflow_id,
            runId: result.run_id,
            requestId,
            tenantId: schedule.tenantId,
            brandId: schedule.brandId,
            goal: schedule.goal,
            status: 'running',
            createdAt: trackedAt,
            updatedAt: trackedAt,
            agent: schedule.definition.agent,
            definition: schedule.definition,
          });
          const latestSchedule = useDurableWorkflowsStore
            .getState()
            .schedules.find((item) => item.id === schedule.id);
          if (latestSchedule) {
            await saveSchedule({
              ...latestSchedule,
              lastWorkflowId: result.workflow_id,
              updatedAt: trackedAt,
            });
          }
          const title = 'Scheduled workflow started';
          const message = schedule.name;
          useNotificationsStore.getState().addNotification({
            type: 'success',
            title,
            message,
          });
          if (desktopNotifications && window.electronAPI?.notifications) {
            try {
              await window.electronAPI.notifications.show({ title, body: message });
            } catch {
              // A desktop notification failure must not turn a successful
              // durable launch into a failed schedule occurrence.
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          const message = launchedWorkflowId
            ? `Workflow ${launchedWorkflowId} started, but desktop tracking failed: ${detail}`
            : detail;
          const latestSchedule = useDurableWorkflowsStore
            .getState()
            .schedules.find((item) => item.id === schedule.id);
          if (latestSchedule) {
            await saveSchedule({
              ...latestSchedule,
              lastWorkflowId: launchedWorkflowId ?? latestSchedule.lastWorkflowId,
              lastError: message,
              updatedAt: new Date().toISOString(),
            });
          }
          useNotificationsStore.getState().addNotification({
            type: launchedWorkflowId ? 'warning' : 'error',
            title: launchedWorkflowId
              ? 'Scheduled workflow needs attention'
              : 'Scheduled workflow failed to start',
            message: `${schedule.name}: ${message}`,
          });
        } finally {
          processing.current.delete(schedule.id);
        }
      })
    );
  }, [apiKey, desktopNotifications, initialized, saveSchedule, schedules, track, workflows]);

  useEffect(() => {
    if (!initialized || !apiKey) return;
    void runDueSchedules();
    const intervalId = window.setInterval(() => void runDueSchedules(), SCHEDULER_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [apiKey, initialized, runDueSchedules]);
}
