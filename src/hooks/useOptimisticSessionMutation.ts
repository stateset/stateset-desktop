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
  const queryClient = useQueryClient();
  const listKey = queryKeys.sessions.list(tenant?.id, currentBrand?.id);

  return useMutation({
    mutationFn: (sessionId: string) => {
      if (!tenant?.id) throw new Error('No tenant selected');
      if (!currentBrand?.id) throw new Error('No brand selected');
      return mutationFn(tenant.id, currentBrand.id, sessionId);
    },
    onMutate: async (sessionId: string) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousSessions = queryClient.getQueryData<AgentSession[]>(listKey);

      if (previousSessions) {
        queryClient.setQueryData<AgentSession[]>(
          listKey,
          previousSessions.map((s) => (s.id === sessionId ? { ...s, status: optimisticStatus } : s))
        );
        uiLogger.debug(`Optimistic update: session ${optimisticStatus}`, { sessionId });
      }

      return { previousSessions };
    },
    onError: (error, sessionId, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(listKey, context.previousSessions);
        uiLogger.warn('Rolled back optimistic update', { sessionId });
      }
      onError?.(error);
    },
    onSuccess: () => {
      onSuccess?.();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}
