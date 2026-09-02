import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { agentApi } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useToast } from '../../../components/ToastProvider';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { useOptimisticSessionMutation } from '../../../hooks/useOptimisticSessionMutation';
import { useAuditLogStore } from '../../../stores/auditLog';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import { getStartableSelection, getStoppableSelection } from '../utils/sessionFilters';
import type { AgentSession } from '../../../types';

interface UseSessionActionsOptions {
  sessions: AgentSession[];
  selectedIds: Set<string>;
  clearSelection: () => void;
}

/**
 * Session lifecycle actions for the Dashboard: start/stop with optimistic
 * updates, bulk start/stop/delete with audit logging, selection-scoped bulk
 * actions, and rename.
 */
export function useSessionActions({
  sessions,
  selectedIds,
  clearSelection,
}: UseSessionActionsOptions) {
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { handleMutationError } = useErrorHandler();

  const [isStartingAll, setIsStartingAll] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [isDeletingStopped, setIsDeletingStopped] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Start session mutation with optimistic update
  const startSession = useOptimisticSessionMutation({
    optimisticStatus: 'starting',
    mutationFn: agentApi.startSession,
    onError: handleMutationError('Failed to start session'),
  });

  // Stop session mutation with optimistic update
  const stopSession = useOptimisticSessionMutation({
    optimisticStatus: 'stopping',
    mutationFn: agentApi.stopSession,
    onError: handleMutationError('Failed to stop session'),
  });

  // Delete session mutation
  const deleteSession = useMutation({
    mutationFn: (sessionId: string) =>
      agentApi.deleteSession(requireTenantId(tenant), requireBrandId(currentBrand), sessionId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
    onError: handleMutationError('Failed to delete session'),
  });

  const handleStartAll = async () => {
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'failed');
    if (stoppedSessions.length === 0) return;

    setIsStartingAll(true);
    try {
      for (const session of stoppedSessions) {
        await startSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.started', `Started agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
      }
      showToast({
        variant: 'success',
        title: 'All Agents Started',
        message: `Started ${stoppedSessions.length} agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsStartingAll(false);
    }
  };

  const handleStopAll = async () => {
    const runningSessions = sessions.filter((s) => s.status === 'running' || s.status === 'paused');
    if (runningSessions.length === 0) return;

    setIsStoppingAll(true);
    try {
      for (const session of runningSessions) {
        await stopSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.stopped', `Stopped agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
      }
      showToast({
        variant: 'success',
        title: 'All Agents Stopped',
        message: `Stopped ${runningSessions.length} agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsStoppingAll(false);
    }
  };

  const handleDeleteStopped = async () => {
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'failed');
    if (stoppedSessions.length === 0) return;

    setIsDeletingStopped(true);
    try {
      let deletedCount = 0;
      for (const session of stoppedSessions) {
        await deleteSession.mutateAsync(session.id);
        useAuditLogStore
          .getState()
          .log('agent.deleted', `Deleted agent "${session.name || session.id}"`, {
            sessionId: session.id,
          });
        deletedCount++;
      }
      showToast({
        variant: 'success',
        title: 'Agents Deleted',
        message: `Deleted ${deletedCount} stopped agent(s)`,
      });
    } catch {
      // Error already handled by mutation
    } finally {
      setIsDeletingStopped(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleBulkStart = useCallback(async () => {
    const toStart = getStartableSelection(sessions, selectedIds);
    for (const s of toStart) {
      try {
        await agentApi.startSession(requireTenantId(tenant), requireBrandId(currentBrand), s.id);
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    clearSelection();
    showToast({
      variant: 'success',
      title: 'Started',
      message: `${toStart.length} agent(s) started.`,
    });
  }, [selectedIds, sessions, tenant, currentBrand, queryClient, clearSelection, showToast]);

  const handleBulkStop = useCallback(async () => {
    const toStop = getStoppableSelection(sessions, selectedIds);
    for (const s of toStop) {
      try {
        await agentApi.stopSession(requireTenantId(tenant), requireBrandId(currentBrand), s.id);
      } catch {
        /* continue */
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    clearSelection();
    showToast({
      variant: 'success',
      title: 'Stopped',
      message: `${toStop.length} agent(s) stopped.`,
    });
  }, [selectedIds, sessions, tenant, currentBrand, queryClient, clearSelection, showToast]);

  const handleRename = useCallback(
    async (id: string, name: string) => {
      try {
        await agentApi.renameSession(
          requireTenantId(tenant),
          requireBrandId(currentBrand),
          id,
          name
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
        showToast({
          variant: 'success',
          title: 'Renamed',
          message: `Session renamed to "${name}".`,
        });
      } catch (error) {
        showToast({
          variant: 'error',
          title: 'Failed to rename',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [tenant, currentBrand, queryClient, showToast]
  );

  return {
    startSession,
    stopSession,
    deleteSession,
    isStartingAll,
    isStoppingAll,
    isDeletingStopped,
    showDeleteConfirm,
    setShowDeleteConfirm,
    handleStartAll,
    handleStopAll,
    handleDeleteStopped,
    handleBulkStart,
    handleBulkStop,
    handleRename,
  };
}
