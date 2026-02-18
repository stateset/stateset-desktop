import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { usePreferencesStore } from '../stores/preferences';
import { requireTenantId } from '../lib/auth-guards';
import type { AgentSession } from '../types';

interface UseBackgroundAgentsOptions {
  /** Auto-start agents that were running before app closed */
  autoRestart?: boolean;
  /** Sync agent status to system tray */
  syncToTray?: boolean;
  /** Show desktop notifications for agent events */
  showNotifications?: boolean;
}

interface BackgroundAgentsState {
  sessions: AgentSession[];
  runningCount: number;
  totalCount: number;
  isLoading: boolean;
  startSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  startAllStopped: () => Promise<void>;
  stopAllRunning: () => Promise<void>;
}

function getRunningAgentsKey(tenantId: string, brandId: string): string {
  return `${tenantId}:${brandId}`;
}

function normalizeRunningAgentsMap(value: unknown, contextKey: string): Record<string, string[]> {
  if (Array.isArray(value)) {
    return {
      [contextKey]: value.filter((id): id is string => typeof id === 'string'),
    };
  }

  if (!value || typeof value !== 'object') {
    return {};
  }

  const map: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(ids)) {
      map[key] = ids.filter((id): id is string => typeof id === 'string');
    }
  }
  return map;
}

/**
 * Hook for managing background agent operations.
 * Handles tray status updates, auto-restart, and notifications.
 */
export function useBackgroundAgents(
  options: UseBackgroundAgentsOptions = {}
): BackgroundAgentsState {
  const { autoRestart = false, syncToTray = true, showNotifications = true } = options;

  const { tenant, currentBrand } = useAuthStore();
  const { desktopNotifications, soundAlerts, refreshInterval } = usePreferencesStore();
  const queryClient = useQueryClient();
  const previousRunningRef = useRef<Set<string>>(new Set());
  const hasAutoRestarted = useRef(false);

  const soundsEnabled = showNotifications && soundAlerts;

  const playNotificationSound = useCallback(() => {
    if (!soundsEnabled) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.05;

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.15);
      oscillator.onended = () => {
        context.close().catch(() => {});
      };
    } catch {
      // Audio might be blocked by the environment; ignore.
    }
  }, [soundsEnabled]);

  // Fetch all sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.sessions.list(tenant?.id, currentBrand?.id),
    queryFn: () => agentApi.listSessions(requireTenantId(tenant), currentBrand?.id),
    enabled: !!tenant?.id,
    refetchInterval: refreshInterval,
  });

  const runningCount = sessions.filter((s) => s.status === 'running').length;
  const totalCount = sessions.length;

  // Update system tray status
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!syncToTray || !electronAPI) return;

    electronAPI.background.updateAgentStatus({
      running: runningCount,
      total: totalCount,
    });
  }, [runningCount, totalCount, syncToTray]);

  // Show notifications for status changes
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!showNotifications || !electronAPI) return;

    const currentRunning = new Set(sessions.filter((s) => s.status === 'running').map((s) => s.id));

    // Check for newly started agents
    currentRunning.forEach((id) => {
      if (!previousRunningRef.current.has(id)) {
        const session = sessions.find((s) => s.id === id);
        if (session && hasAutoRestarted.current) {
          if (desktopNotifications) {
            electronAPI.notifications.show({
              title: 'Agent Started',
              body: `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} agent is now running.`,
            });
          }
          playNotificationSound();
        }
      }
    });

    // Check for stopped agents
    previousRunningRef.current.forEach((id) => {
      if (!currentRunning.has(id)) {
        const session = sessions.find((s) => s.id === id);
        if (session && session.status === 'failed') {
          if (desktopNotifications) {
            electronAPI.notifications.show({
              title: 'Agent Failed',
              body: `${session.agent_type.charAt(0).toUpperCase() + session.agent_type.slice(1)} agent has stopped due to an error.`,
            });
          }
          playNotificationSound();
        }
      }
    });

    previousRunningRef.current = currentRunning;
  }, [sessions, showNotifications, desktopNotifications, playNotificationSound]);

  // Auto-restart previously running agents
  useEffect(() => {
    if (!autoRestart || hasAutoRestarted.current || !tenant || !currentBrand) return;

    const restoreAgents = async () => {
      try {
        // Get list of agents that should be running from local storage
        const electronAPI = window.electronAPI;
        if (!electronAPI) return;
        const contextKey = getRunningAgentsKey(tenant.id, currentBrand.id);
        const storedRunning = await electronAPI.store.get('runningAgents');
        const runningMap = normalizeRunningAgentsMap(storedRunning, contextKey);
        const savedRunning = runningMap[contextKey];

        if (Array.isArray(storedRunning)) {
          await electronAPI.store.set('runningAgents', runningMap);
        }

        if (!savedRunning || savedRunning.length === 0) return;

        hasAutoRestarted.current = true;

        // Start each agent that was previously running
        for (const sessionId of savedRunning) {
          const session = sessions.find((s) => s.id === sessionId);
          if (session && (session.status === 'stopped' || session.status === 'failed')) {
            try {
              await agentApi.startSession(tenant.id, currentBrand.id, sessionId);
            } catch (err) {
              console.error(`Failed to auto-restart agent ${sessionId}:`, err);
            }
          }
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      } catch (err) {
        console.error('Failed to restore running agents:', err);
      }
    };

    if (sessions.length > 0) {
      restoreAgents();
    }
  }, [autoRestart, sessions, tenant, currentBrand, queryClient]);

  // Save running agents to local storage on change
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI || !tenant?.id || !currentBrand?.id) return;

    const runningIds = sessions.filter((s) => s.status === 'running').map((s) => s.id);

    const persistRunningAgents = async () => {
      const contextKey = getRunningAgentsKey(tenant.id, currentBrand.id);
      const storedRunning = await electronAPI.store.get('runningAgents');
      const runningMap = normalizeRunningAgentsMap(storedRunning, contextKey);
      runningMap[contextKey] = runningIds;
      await electronAPI.store.set('runningAgents', runningMap);
    };

    persistRunningAgents().catch(() => {});
  }, [sessions, tenant?.id, currentBrand?.id]);

  // Start session mutation
  const startMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!tenant || !currentBrand) throw new Error('No tenant or brand selected');
      return agentApi.startSession(tenant.id, currentBrand.id, sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });

  // Stop session mutation
  const stopMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!tenant || !currentBrand) throw new Error('No tenant or brand selected');
      return agentApi.stopSession(tenant.id, currentBrand.id, sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });

  const startSession = useCallback(
    async (sessionId: string) => {
      await startMutation.mutateAsync(sessionId);
    },
    [startMutation]
  );

  const stopSession = useCallback(
    async (sessionId: string) => {
      await stopMutation.mutateAsync(sessionId);
    },
    [stopMutation]
  );

  const startAllStopped = useCallback(async () => {
    const stoppedSessions = sessions.filter((s) => s.status === 'stopped' || s.status === 'failed');

    for (const session of stoppedSessions) {
      try {
        await startSession(session.id);
      } catch (err) {
        console.error(`Failed to start session ${session.id}:`, err);
      }
    }
  }, [sessions, startSession]);

  const stopAllRunning = useCallback(async () => {
    const runningSessions = sessions.filter((s) => s.status === 'running' || s.status === 'paused');

    for (const session of runningSessions) {
      try {
        await stopSession(session.id);
      } catch (err) {
        console.error(`Failed to stop session ${session.id}:`, err);
      }
    }
  }, [sessions, stopSession]);

  return {
    sessions,
    runningCount,
    totalCount,
    isLoading,
    startSession,
    stopSession,
    startAllStopped,
    stopAllRunning,
  };
}
