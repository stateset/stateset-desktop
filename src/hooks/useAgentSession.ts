import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { agentApi } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { normalizeAgentConfig } from '../lib/agentConfig';
import { queryKeys } from '../lib/queryKeys';
import { usePreferencesStore } from '../stores/preferences';
import type { AgentSession, AgentSessionConfig } from '../types';

interface UseAgentSessionOptions {
  sessionId: string;
  onError?: (title: string, message: string) => void;
  onSuccess?: (title: string, message: string) => void;
}

export function useAgentSession({ sessionId, onError, onSuccess }: UseAgentSessionOptions) {
  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const queryClient = useQueryClient();
  const refreshInterval = usePreferencesStore((s) => s.refreshInterval);
  const lastQueryErrorRef = useRef<string | null>(null);

  // Safe accessors — guards against null tenant/brand in mutation callbacks
  const getTenantId = useCallback(() => {
    if (!tenant?.id) throw new Error('No tenant selected');
    return tenant.id;
  }, [tenant]);

  const getBrandId = useCallback(() => {
    if (!currentBrand?.id) throw new Error('No brand selected');
    return currentBrand.id;
  }, [currentBrand]);

  const handleMutationError = useCallback(
    (title: string) => (error: unknown) => {
      onError?.(title, getErrorMessage(error));
    },
    [onError]
  );

  const handleQueryError = useCallback(
    (title: string) => (error: unknown) => {
      const message = getErrorMessage(error);
      if (lastQueryErrorRef.current === message) {
        return;
      }
      lastQueryErrorRef.current = message;
      onError?.(title, message);
    },
    [onError]
  );

  // Fetch session
  const {
    data: session,
    isLoading,
    error: sessionError,
    refetch,
  } = useQuery<AgentSession>({
    queryKey: queryKeys.sessions.detail(sessionId),
    queryFn: () => agentApi.getSession(getTenantId(), getBrandId(), sessionId),
    enabled: !!tenant?.id && !!currentBrand?.id && !!sessionId,
    refetchInterval: refreshInterval,
  });

  useEffect(() => {
    if (sessionError) {
      handleQueryError('Failed to load session')(sessionError);
    } else {
      lastQueryErrorRef.current = null;
    }
  }, [sessionError, handleQueryError]);

  // Mutations
  const startSession = useMutation({
    mutationFn: () => agentApi.startSession(getTenantId(), getBrandId(), sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
      onSuccess?.('Session Started', 'Agent session has been started.');
    },
    onError: handleMutationError('Failed to start session'),
  });

  const pauseSession = useMutation({
    mutationFn: () => agentApi.pauseSession(getTenantId(), getBrandId(), sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
    onError: handleMutationError('Failed to pause session'),
  });

  const resumeSession = useMutation({
    mutationFn: () => agentApi.resumeSession(getTenantId(), getBrandId(), sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
    onError: handleMutationError('Failed to resume session'),
  });

  const stopSession = useMutation({
    mutationFn: () => agentApi.stopSession(getTenantId(), getBrandId(), sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
      onSuccess?.('Session Stopped', 'Agent session has been stopped.');
    },
    onError: handleMutationError('Failed to stop session'),
  });

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      agentApi.sendMessage(getTenantId(), getBrandId(), sessionId, message),
    onError: handleMutationError('Failed to send message'),
  });

  const updateConfig = useMutation({
    mutationFn: (config: AgentSessionConfig) =>
      agentApi.updateConfig(getTenantId(), getBrandId(), sessionId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
      onSuccess?.('Config Updated', 'Agent settings have been saved.');
    },
    onError: handleMutationError('Failed to update config'),
  });

  const cloneAgent = useMutation({
    mutationFn: (config: Partial<AgentSessionConfig>) =>
      agentApi.createSession(
        getTenantId(),
        getBrandId(),
        session?.agent_type || 'interactive',
        config
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      onSuccess?.('Agent Cloned', 'New agent created with the same configuration.');
    },
    onError: handleMutationError('Failed to clone agent'),
  });

  // Computed status states
  const statusIsRunning = session?.status === 'running';
  const statusIsPaused = session?.status === 'paused';
  const statusIsStopped = session?.status === 'stopped' || session?.status === 'failed';
  const statusIsStarting = session?.status === 'starting';
  const statusIsStopping = session?.status === 'stopping';

  return {
    // Data
    session,
    isLoading,
    error: sessionError,

    // Status states (based on session status)
    isRunning: statusIsRunning,
    isPaused: statusIsPaused,
    isStopped: statusIsStopped,
    isStatusStarting: statusIsStarting,
    isStatusStopping: statusIsStopping,

    // Actions
    startSession: startSession.mutate,
    startSessionAsync: startSession.mutateAsync,
    pauseSession: pauseSession.mutate,
    pauseSessionAsync: pauseSession.mutateAsync,
    resumeSession: resumeSession.mutate,
    resumeSessionAsync: resumeSession.mutateAsync,
    stopSession: stopSession.mutate,
    stopSessionAsync: stopSession.mutateAsync,
    sendMessage: sendMessage.mutate,
    sendMessageAsync: sendMessage.mutateAsync,
    updateConfig: (config: AgentSessionConfig) => updateConfig.mutate(config),
    updateConfigAsync: updateConfig.mutateAsync,
    cloneAgent: cloneAgent.mutate,
    cloneAgentAsync: cloneAgent.mutateAsync,
    refetch,

    // Loading states (based on mutation pending state)
    isStarting: startSession.isPending,
    isPausing: pauseSession.isPending,
    isResuming: resumeSession.isPending,
    isStopping: stopSession.isPending,
    isSendingMessage: sendMessage.isPending,
    isUpdatingConfig: updateConfig.isPending,
    isCloning: cloneAgent.isPending,
  };
}

// Hook for managing config editing
export function useAgentConfigEditor(initialConfig?: AgentSessionConfig | null) {
  const [configDraft, setConfigDraft] = useState<AgentSessionConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const openEditor = useCallback(() => {
    if (initialConfig) {
      setConfigDraft(normalizeAgentConfig(initialConfig));
    }
    setIsEditing(true);
  }, [initialConfig]);

  const closeEditor = useCallback(() => {
    setIsEditing(false);
  }, []);

  const updateDraft = useCallback((updates: Partial<AgentSessionConfig>) => {
    setConfigDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const resetDraft = useCallback(() => {
    if (initialConfig) {
      setConfigDraft(normalizeAgentConfig(initialConfig));
    }
  }, [initialConfig]);

  const getNormalizedConfig = useCallback(() => {
    if (!configDraft) return null;
    return normalizeAgentConfig(configDraft, initialConfig ?? undefined);
  }, [configDraft, initialConfig]);

  // Sync with initial config when it changes
  useEffect(() => {
    if (initialConfig && !isEditing) {
      setConfigDraft(normalizeAgentConfig(initialConfig));
    }
  }, [initialConfig, isEditing]);

  return {
    configDraft,
    isEditing,
    openEditor,
    closeEditor,
    updateDraft,
    resetDraft,
    getNormalizedConfig,
  };
}
