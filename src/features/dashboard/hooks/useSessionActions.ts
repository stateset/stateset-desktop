import { useState, useCallback, useRef, useEffect } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/auth';
import { agentApi } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { uiLogger } from '../../../lib/logger';
import { useToast } from '../../../components/ToastProvider';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { useOptimisticSessionMutation } from '../../../hooks/useOptimisticSessionMutation';
import { useAuditLogStore } from '../../../stores/auditLog';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import { getStartableSelection, getStoppableSelection } from '../utils/sessionFilters';
import {
  canApplySessionAction,
  describeBatchResult,
  type SessionAction,
  type BatchProgress,
  type BatchResult,
} from '../utils/sessionActions';
import type { AgentSession } from '../../../types';

interface ActionContext {
  tenantId: string;
  brandId: string;
  apiKey: string | null;
}
interface ActionSnapshot {
  action: SessionAction;
  targets: AgentSession[];
  context: ActionContext;
}
// This activity belongs to the desktop, not to one mounted Dashboard. Navigating
// away must not unlock requests or lose the outcome of the running batch.
const actionInFlight = { current: false };
const activeContext: { current: ActionContext | null } = { current: null };
const resultContext: { current: ActionContext | null } = { current: null };
const retrySnapshot: { current: ActionSnapshot | null } = { current: null };
const useActionActivity = create<{
  isActionBusy: boolean;
  batchProgress: BatchProgress | null;
  batchResult: BatchResult | null;
  batchKind: 'fleet' | 'selection' | null;
}>(() => ({ isActionBusy: false, batchProgress: null, batchResult: null, batchKind: null }));
const setIsActionBusy = (isActionBusy: boolean) => useActionActivity.setState({ isActionBusy });
const setBatchProgress = (batchProgress: BatchProgress | null) =>
  useActionActivity.setState({ batchProgress });
const setBatchResult = (batchResult: BatchResult | null) =>
  useActionActivity.setState({ batchResult });
const setBatchKind = (batchKind: 'fleet' | 'selection' | null) =>
  useActionActivity.setState({ batchKind });

function isCurrentContext(context: ActionContext): boolean {
  const auth = useAuthStore.getState();
  return (
    auth.tenant?.id === context.tenantId &&
    auth.currentBrand?.id === context.brandId &&
    auth.apiKey === context.apiKey
  );
}

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
  const apiKey = useAuthStore((s) => s.apiKey);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { handleMutationError } = useErrorHandler();

  const isActionBusy = useActionActivity((state) => state.isActionBusy);
  const batchProgress = useActionActivity((state) => state.batchProgress);
  const batchResult = useActionActivity((state) => state.batchResult);
  const [deleteSnapshot, setDeleteSnapshot] = useState<ActionSnapshot | null>(null);
  const batchKind = useActionActivity((state) => state.batchKind);
  const rowContext = useRef<ActionContext | null>(null);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // A confirmation or retry from one workspace must never move to another.
  useEffect(() => {
    setDeleteSnapshot(null);
    if (resultContext.current && !isCurrentContext(resultContext.current)) {
      setBatchResult(null);
      retrySnapshot.current = null;
      resultContext.current = null;
    }
  }, [tenant?.id, currentBrand?.id, apiKey]);

  const readContext = useCallback((): ActionContext | null => {
    try {
      const context = {
        tenantId: requireTenantId(tenant),
        brandId: requireBrandId(currentBrand),
        apiKey,
      };
      if (!isCurrentContext(context)) throw new Error('Workspace changed. Please try again.');
      return context;
    } catch (error) {
      handleMutationError('Unable to update agents')(error);
      return null;
    }
  }, [tenant, currentBrand, apiKey, handleMutationError]);

  // Start session mutation with optimistic update
  const startSession = useOptimisticSessionMutation({
    optimisticStatus: 'starting',
    mutationFn: (tenantId, brandId, id) => {
      if (rowContext.current && !isCurrentContext(rowContext.current))
        throw new Error('Workspace changed. Please try again.');
      return agentApi.startSession(tenantId, brandId, id);
    },
    onError: handleMutationError('Failed to start session'),
  });

  // Stop session mutation with optimistic update
  const stopSession = useOptimisticSessionMutation({
    optimisticStatus: 'stopping',
    mutationFn: (tenantId, brandId, id) => {
      if (rowContext.current && !isCurrentContext(rowContext.current))
        throw new Error('Workspace changed. Please try again.');
      return agentApi.stopSession(tenantId, brandId, id);
    },
    onError: handleMutationError('Failed to stop session'),
  });

  const runBatch = useCallback(
    async (snapshot: ActionSnapshot, kind: 'fleet' | 'selection' = 'fleet') => {
      if (actionInFlight.current || snapshot.targets.length === 0) return;
      const { action, context } = snapshot;
      if (!isCurrentContext(context)) return;
      const targets = [...snapshot.targets];
      actionInFlight.current = true;
      activeContext.current = context;
      setIsActionBusy(true);
      setBatchKind(kind);
      setBatchResult(null);
      retrySnapshot.current = null;
      setBatchProgress({ action, completed: 0, total: targets.length });
      const result: BatchResult = {
        action,
        total: targets.length,
        succeeded: 0,
        failed: [],
        skipped: 0,
      };
      try {
        for (let index = 0; index < targets.length; index++) {
          if (!isCurrentContext(context)) {
            result.skipped += targets.length - index;
            break;
          }
          const target = targets[index];
          const latestSessions =
            queryClient.getQueryData<AgentSession[]>(
              queryKeys.sessions.list(context.tenantId, context.brandId)
            ) ?? sessionsRef.current;
          const latest = latestSessions.find((session) => session.id === target.id);
          if (!latest || !canApplySessionAction(latest, action)) {
            result.skipped++;
          } else {
            let completed = false;
            try {
              const operation = {
                start: agentApi.startSession,
                stop: agentApi.stopSession,
                delete: agentApi.deleteSession,
              }[action];
              await operation(context.tenantId, context.brandId, target.id);
              completed = true;
            } catch {
              result.failed.push(target);
            }
            if (completed) {
              result.succeeded++;
              const verb = { start: 'Started', stop: 'Stopped', delete: 'Deleted' }[action];
              const auditAction = {
                start: 'agent.started',
                stop: 'agent.stopped',
                delete: 'agent.deleted',
              } as const;
              try {
                useAuditLogStore
                  .getState()
                  .log(auditAction[action], `${verb} agent "${target.name || target.id}"`, {
                    sessionId: target.id,
                    tenantId: context.tenantId,
                    brandId: context.brandId,
                  });
              } catch {
                // A local audit failure must not make a completed API request retryable.
                uiLogger.warn('Could not record completed fleet action', { sessionId: target.id });
              }
            }
          }
          setBatchProgress({ action, completed: index + 1, total: targets.length });
        }
        setBatchProgress({ action, completed: targets.length, total: targets.length });
        // Refresh once per batch, scoped to the original workspace. Never refetch
        // an old workspace with credentials belonging to a newly selected one.
        await queryClient.invalidateQueries({
          queryKey: queryKeys.sessions.list(context.tenantId, context.brandId),
          exact: true,
          refetchType: isCurrentContext(context) ? 'active' : 'none',
        });
        if (isCurrentContext(context)) {
          clearSelection();
          resultContext.current = context;
          setBatchResult(result);
          retrySnapshot.current =
            result.failed.length > 0 ? { action, context, targets: result.failed } : null;
          showToast({
            variant:
              result.failed.length === 0 && result.skipped === 0
                ? 'success'
                : result.succeeded === 0
                  ? 'error'
                  : 'warning',
            title:
              result.failed.length || result.skipped
                ? `${kind === 'selection' ? 'Bulk' : 'Fleet'} action incomplete`
                : { start: 'Agents Started', stop: 'Agents Stopped', delete: 'Agents Deleted' }[
                    action
                  ],
            message: describeBatchResult(result),
          });
        }
      } finally {
        actionInFlight.current = false;
        activeContext.current = null;
        setIsActionBusy(false);
        setBatchProgress(null);
        setBatchKind(null);
        if (action === 'delete') setDeleteSnapshot(null);
      }
    },
    [queryClient, clearSelection, showToast]
  );

  const beginBatch = useCallback(
    (action: 'start' | 'stop', selectedOnly: boolean) => {
      if (actionInFlight.current) return Promise.resolve();
      const targets = selectedOnly
        ? action === 'start'
          ? getStartableSelection(sessions, selectedIds)
          : getStoppableSelection(sessions, selectedIds)
        : sessions.filter((session) => canApplySessionAction(session, action));
      if (!targets.length) return Promise.resolve();
      const context = readContext();
      return context
        ? runBatch({ action, targets, context }, selectedOnly ? 'selection' : 'fleet')
        : Promise.resolve();
    },
    [sessions, selectedIds, readContext, runBatch]
  );

  const setShowDeleteConfirm = useCallback(
    (open: boolean) => {
      if (actionInFlight.current) return;
      if (!open) {
        setDeleteSnapshot(null);
        return;
      }
      const context = readContext();
      const targets = sessions.filter((session) => canApplySessionAction(session, 'delete'));
      if (context && targets.length) setDeleteSnapshot({ action: 'delete', targets, context });
    },
    [sessions, readContext]
  );

  const handleDeleteStopped = useCallback(() => {
    // Deletion always requires a snapshot the user has explicitly reviewed.
    return deleteSnapshot ? runBatch(deleteSnapshot) : Promise.resolve();
  }, [deleteSnapshot, runBatch]);
  const handleStartAll = useCallback(() => beginBatch('start', false), [beginBatch]);
  const handleStopAll = useCallback(() => beginBatch('stop', false), [beginBatch]);
  const handleBulkStart = useCallback(() => beginBatch('start', true), [beginBatch]);
  const handleBulkStop = useCallback(() => beginBatch('stop', true), [beginBatch]);

  const retryFailed = useCallback(() => {
    const snapshot = retrySnapshot.current;
    if (!snapshot || actionInFlight.current || !isCurrentContext(snapshot.context))
      return Promise.resolve();
    if (snapshot.action === 'delete') {
      const targets = snapshot.targets.filter((target) => {
        const latest = sessionsRef.current.find((session) => session.id === target.id);
        return latest && canApplySessionAction(latest, 'delete');
      });
      if (targets.length) setDeleteSnapshot({ ...snapshot, targets });
      else {
        setBatchResult({
          action: 'delete',
          total: snapshot.targets.length,
          succeeded: 0,
          failed: [],
          skipped: snapshot.targets.length,
        });
        retrySnapshot.current = null;
        showToast({
          variant: 'info',
          title: 'No agents to delete',
          message: 'The reviewed agents are no longer eligible for cleanup.',
        });
      }
      return Promise.resolve();
    }
    return runBatch(snapshot);
  }, [runBatch, showToast]);
  const dismissBatchResult = useCallback(() => {
    setBatchResult(null);
    retrySnapshot.current = null;
  }, []);

  const runSingle = useCallback(
    async (action: 'start' | 'stop', id: string) => {
      if (actionInFlight.current) return;
      const context = readContext();
      if (!context) return;
      const target = sessionsRef.current.find((session) => session.id === id);
      if (!target || !canApplySessionAction(target, action)) return;
      actionInFlight.current = true;
      activeContext.current = context;
      setIsActionBusy(true);
      rowContext.current = context;
      try {
        await (action === 'start' ? startSession : stopSession).mutateAsync(id);
      } catch {
        // The optimistic mutation rolls back and reports this individual failure.
      } finally {
        actionInFlight.current = false;
        activeContext.current = null;
        rowContext.current = null;
        setIsActionBusy(false);
      }
    },
    [readContext, startSession, stopSession]
  );
  const handleStartSession = useCallback((id: string) => runSingle('start', id), [runSingle]);
  const handleStopSession = useCallback((id: string) => runSingle('stop', id), [runSingle]);

  const handleRename = useCallback(
    async (id: string, name: string) => {
      if (actionInFlight.current) return;
      const context = readContext();
      if (!context) return;
      actionInFlight.current = true;
      activeContext.current = context;
      setIsActionBusy(true);
      try {
        await agentApi.renameSession(context.tenantId, context.brandId, id, name);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.sessions.list(context.tenantId, context.brandId),
          exact: true,
          refetchType: isCurrentContext(context) ? 'active' : 'none',
        });
        if (!isCurrentContext(context)) return;
        showToast({
          variant: 'success',
          title: 'Renamed',
          message: `Session renamed to "${name}".`,
        });
      } catch (error) {
        if (!isCurrentContext(context)) return;
        showToast({
          variant: 'error',
          title: 'Failed to rename',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        actionInFlight.current = false;
        activeContext.current = null;
        setIsActionBusy(false);
      }
    },
    [queryClient, showToast, readContext]
  );

  return {
    isStartingAll: batchKind === 'fleet' && batchProgress?.action === 'start',
    isStoppingAll: batchKind === 'fleet' && batchProgress?.action === 'stop',
    isDeletingStopped: batchProgress?.action === 'delete',
    isBulkActing: batchKind === 'selection',
    isActionBusy,
    isPreviousWorkspaceAction:
      isActionBusy && activeContext.current !== null && !isCurrentContext(activeContext.current),
    batchProgress,
    batchResult:
      resultContext.current && isCurrentContext(resultContext.current) ? batchResult : null,
    retryFailed,
    dismissBatchResult,
    handleStartSession,
    handleStopSession,
    deleteCount: deleteSnapshot?.targets.length ?? 0,
    showDeleteConfirm: deleteSnapshot !== null && isCurrentContext(deleteSnapshot.context),
    setShowDeleteConfirm,
    handleStartAll,
    handleStopAll,
    handleDeleteStopped,
    handleBulkStart,
    handleBulkStop,
    handleRename,
  };
}
