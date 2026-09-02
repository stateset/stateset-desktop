import { useCallback, useEffect, useRef } from 'react';
import { durableWorkflowApi } from '../lib/durableWorkflows';
import { isDurableWorkflowTerminal } from '../lib/durableWorkflowStatus';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';
import { useNotificationsStore } from '../stores/notifications';
import { usePreferencesStore } from '../stores/preferences';

export function useDurableWorkflowMonitor() {
  const initialized = useDurableWorkflowsStore((state) => state.initialized);
  const apiKey = useDurableWorkflowsStore((state) => state.apiKey);
  const workflows = useDurableWorkflowsStore((state) => state.workflows);
  const initialize = useDurableWorkflowsStore((state) => state.initialize);
  const updateStatus = useDurableWorkflowsStore((state) => state.updateStatus);
  const setError = useDurableWorkflowsStore((state) => state.setError);
  const desktopNotifications = usePreferencesStore((state) => state.desktopNotifications);
  const pollingRef = useRef(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const poll = useCallback(async () => {
    if (!initialized || !apiKey || pollingRef.current) return;
    const active = workflows.filter((workflow) => !isDurableWorkflowTerminal(workflow.status));
    if (!active.length) return;

    pollingRef.current = true;
    try {
      await Promise.all(
        active.map(async (workflow) => {
          try {
            const status = await durableWorkflowApi.status(workflow.tenantId, workflow.workflowId);
            await updateStatus(workflow.workflowId, status);
            if (isDurableWorkflowTerminal(status.status)) {
              const succeeded = status.status === 'completed' || status.status === 'planner_done';
              const title = succeeded
                ? 'Background workflow completed'
                : 'Background workflow stopped';
              const message = `${workflow.goal}: ${status.status.replace(/_/g, ' ')}`;
              useNotificationsStore.getState().addNotification({
                type: succeeded ? 'success' : 'warning',
                title,
                message,
              });
              if (desktopNotifications && window.electronAPI?.notifications) {
                await window.electronAPI.notifications.show({ title, body: message });
              }
            }
          } catch (error) {
            await setError(
              workflow.workflowId,
              error instanceof Error ? error.message : String(error)
            );
          }
        })
      );
    } finally {
      pollingRef.current = false;
    }
  }, [apiKey, desktopNotifications, initialized, setError, updateStatus, workflows]);

  useEffect(() => {
    if (!initialized || !apiKey) return;
    void poll();
    const intervalId = window.setInterval(() => void poll(), 10_000);
    return () => window.clearInterval(intervalId);
  }, [apiKey, initialized, poll]);
}
