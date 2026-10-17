import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { queryKeys } from '../lib/queryKeys';
import { uiLogger } from '../lib/logger';
import type { AgentSession, AgentSessionStatus } from '../types';

interface UseOptimisticSessionMutationOptions {
  /** The optimistic status to set while the mutation is in flight */
  optimisticStatus: AgentSessionStatus;
  /** The mutation function — receives (tenantId, brandId, sessionId) */
  mutationFn: (tenantId: string, brandId: string, sessionId: string) => Promise<unknown>;
  /** Called with error object on failure */
  onError?: (error: unknown) => void;
  /** Called on success */
  onSuccess?: () => void;
}

/**
 * Shared hook for session mutations that need optimistic list updates.
 *
 * Handles the cancel → snapshot → optimistic update → rollback pattern
 * that was previously duplicated across start/stop/pause/resume in Dashboard.
 */
export function useOptimisticSessionMutation({
  optimisticStatus,
  mutationFn,
  onError,
  onSuccess,
}: UseOptimisticSessionMutationOptions) {
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const apiKey = useAuthStore((s) => s.apiKey);
  const queryClient = useQueryClient();
  const listKey = queryKeys.sessions.list(tenant?.id, currentBrand?.id);
  const credential = useRef({ value: apiKey, version: 0 });
  if (credential.current.value !== apiKey) {
    credential.current = { value: apiKey, version: credential.current.version + 1 };
  }
  const isCurrentContext = () => {
    const auth = useAuthStore.getState();
    return (
      auth.tenant?.id === tenant?.id &&
      auth.currentBrand?.id === currentBrand?.id &&
      auth.apiKey === apiKey
    );
  };
  const requireContext = () => {
    const tenantId = tenant?.id;
    const brandId = currentBrand?.id;
    if (!tenantId) throw new Error('No tenant selected');
    if (!brandId) throw new Error('No brand selected');
    if (!isCurrentContext()) throw new Error('Workspace changed. Please try again.');
    return { tenantId, brandId };
  };

  return useMutation({
    // A scope change detaches the observer from an in-flight mutation, keeping
    // its callbacks bound to the original operation. Never put credentials in keys.
    mutationKey: [
      'session-lifecycle',
      tenant?.id,
      currentBrand?.id,
      credential.current.version,
      optimisticStatus,
    ],
    mutationFn: (sessionId: string) => {
      const { tenantId, brandId } = requireContext();
      return mutationFn(tenantId, brandId, sessionId);
    },
    onMutate: async (sessionId: string) => {
      requireContext();
      await queryClient.cancelQueries({ queryKey: listKey, exact: true });
      requireContext();

      const previousSessions = queryClient.getQueryData<AgentSession[]>(listKey);
      let optimisticSessions: AgentSession[] | undefined;

      if (previousSessions) {
        optimisticSessions = queryClient.setQueryData<AgentSession[]>(
          listKey,
          previousSessions.map((s) => (s.id === sessionId ? { ...s, status: optimisticStatus } : s))
        );
        uiLogger.debug(`Optimistic update: session ${optimisticStatus}`, { sessionId });
      }

      return { listKey, previousSessions, optimisticSessions };
    },
    onError: (error, sessionId, context) => {
      if (
        context?.previousSessions &&
        useAuthStore.getState().apiKey === apiKey &&
        queryClient.getQueryData(context.listKey) === context.optimisticSessions
      ) {
        // Preserve a newer response, another optimistic update, or a cleared cache.
        queryClient.setQueryData(context.listKey, context.previousSessions);
        uiLogger.warn('Rolled back optimistic update', { sessionId });
      }
      if (isCurrentContext()) onError?.(error);
    },
    onSuccess: () => {
      if (isCurrentContext()) onSuccess?.();
    },
    onSettled: (_data, _error, _sessionId, context) => {
      if (!tenant?.id || !currentBrand?.id) return;
      return queryClient.invalidateQueries({
        queryKey: context?.listKey ?? listKey,
        exact: true,
        refetchType: isCurrentContext() ? 'active' : 'none',
      });
    },
  });
}
