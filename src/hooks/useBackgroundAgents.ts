import { useEffect, useCallback, useRef, useReducer, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { agentApi } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { usePreferencesStore } from '../stores/preferences';
import { requireTenantId } from '../lib/auth-guards';
import type { AgentSession } from '../types';

// Serialize read/merge/write operations so independent workspace snapshots cannot erase each other.
let runningAgentWrites: Promise<void> = Promise.resolve();

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

  const tenant = useAuthStore((s) => s.tenant);
  const currentBrand = useAuthStore((s) => s.currentBrand);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const apiKey = useAuthStore((s) => s.apiKey);
  const initialized = usePreferencesStore((s) => s.initialized);
  const autoStartEnabled = usePreferencesStore((s) => s.autoStartAgentsOnLaunch);
  const autoStartSave = usePreferencesStore((s) => s.saves.autoStartAgentsOnLaunch);
  const preferencesReady = initialized && !autoStartSave?.pending && !autoStartSave?.error;
  const desktopNotifications = usePreferencesStore((s) => s.desktopNotifications);
  const soundAlerts = usePreferencesStore((s) => s.soundAlerts);
  const refreshInterval = usePreferencesStore((s) => s.refreshInterval);
  const queryClient = useQueryClient();
  const previousRunningRef = useRef<Set<string>>(new Set());
  const lifecycle = useRef({ version: 0, mounted: false });
  const recovery = useRef<{ version: number; settled: boolean } | null>(null);
  const attempted = useRef(new Set<string>());
  const persistenceVersion = useRef(0);
  const autoRestartRef = useRef(autoRestart);
  autoRestartRef.current = autoRestart;
  const [recoveryRevision, markRecovered] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const lifetime = lifecycle.current;
    lifetime.mounted = true;
    // Invalidate synchronously, including an away/back transition batched into one render.
    const auth = useAuthStore.subscribe((state, previous) => {
      if (
        state.tenant?.id !== previous.tenant?.id ||
        state.currentBrand?.id !== previous.currentBrand?.id ||
        state.currentBrand?.tenant_id !== previous.currentBrand?.tenant_id ||
        state.currentBrand?.enabled !== previous.currentBrand?.enabled ||
        state.apiKey !== previous.apiKey ||
        state.isAuthenticated !== previous.isAuthenticated ||
        state.isLoading !== previous.isLoading
      )
        lifetime.version++;
    });
    const preferences = usePreferencesStore.subscribe((state, previous) => {
      if (
        state.initialized !== previous.initialized ||
        state.autoStartAgentsOnLaunch !== previous.autoStartAgentsOnLaunch ||
        state.saves.autoStartAgentsOnLaunch?.pending !==
          previous.saves.autoStartAgentsOnLaunch?.pending ||
        state.saves.autoStartAgentsOnLaunch?.error !== previous.saves.autoStartAgentsOnLaunch?.error
      )
        lifetime.version++;
    });
    return () => {
      lifetime.mounted = false;
      lifetime.version++;
      auth();
      preferences();
    };
  }, []);

  useEffect(() => {
    lifecycle.current.version++;
  }, [autoRestart]);

  const currentOwner = useCallback(() => {
    const auth = useAuthStore.getState();
    const preferences = usePreferencesStore.getState();
    const save = preferences.saves.autoStartAgentsOnLaunch;
    const snapshot = queryClient.getQueryData<AgentSession[]>(
      queryKeys.sessions.list(tenant?.id, currentBrand?.id)
    );
    return (
      lifecycle.current.mounted &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.apiKey === apiKey &&
      !!tenant?.id &&
      !!currentBrand?.id &&
      auth.tenant?.id === tenant.id &&
      auth.currentBrand?.id === currentBrand.id &&
      auth.currentBrand.enabled !== false &&
      auth.currentBrand.tenant_id === tenant.id &&
      Array.isArray(snapshot) &&
      snapshot.every((item) => item.tenant_id === tenant.id) &&
      preferences.initialized &&
      !save?.pending &&
      !save?.error &&
      queryClient.getQueryState(queryKeys.sessions.list(tenant.id, currentBrand.id))?.status ===
        'success'
    );
  }, [tenant?.id, currentBrand?.id, apiKey, queryClient]);
  const hasInitializedRunningState = useRef(false);

  useEffect(() => {
    previousRunningRef.current = new Set();
    hasInitializedRunningState.current = false;
  }, [tenant?.id, currentBrand?.id]);

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
  const {
    data: allSessions,
    isLoading,
    isSuccess,
  } = useQuery({
    queryKey: queryKeys.sessions.list(tenant?.id, currentBrand?.id),
    queryFn: () => agentApi.listSessions(requireTenantId(tenant), currentBrand?.id),
    enabled: isAuthenticated && !authLoading && !!tenant?.id && !!currentBrand?.id,
    refetchInterval: refreshInterval,
  });

  const sessions = useMemo(
    () =>
      (allSessions ?? []).filter(
        (item) => item.tenant_id === tenant?.id && item.brand_id === currentBrand?.id
      ),
    [allSessions, tenant?.id, currentBrand?.id]
  );

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
        if (session && hasInitializedRunningState.current) {
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
    hasInitializedRunningState.current = true;
  }, [sessions, showNotifications, desktopNotifications, playNotificationSound]);

  // Restore once per confirmed context; refreshes must not duplicate outstanding starts.
  useEffect(() => {
    if (
      !autoRestart ||
      !preferencesReady ||
      !autoStartEnabled ||
      !isSuccess ||
      !tenant ||
      !currentBrand ||
      !currentOwner()
    )
      return;
    const version = lifecycle.current.version;
    if (recovery.current?.version === version) return;
    const run = { version, settled: false };
    recovery.current = run;
    const current = () =>
      currentOwner() &&
      lifecycle.current.version === version &&
      recovery.current === run &&
      autoRestartRef.current &&
      usePreferencesStore.getState().autoStartAgentsOnLaunch;
    const restoreAgents = async () => {
      try {
        const api = window.electronAPI;
        if (!api) return;
        const key = getRunningAgentsKey(tenant.id, currentBrand.id);
        const stored = await api.store.get('runningAgents');
        if (!current()) return;
        const saved = normalizeRunningAgentsMap(stored, key)[key] ?? [];
        const acknowledged: AgentSession[] = [];
        for (const id of new Set(saved)) {
          if (!current()) return;
          const latest = queryClient.getQueryData<AgentSession[]>(
            queryKeys.sessions.list(tenant.id, currentBrand.id)
          );
          const session = latest?.find(
            (item) =>
              item.id === id && item.tenant_id === tenant.id && item.brand_id === currentBrand.id
          );
          const attemptKey = `${key}:${id}`;
          if (
            !session ||
            !['stopped', 'failed'].includes(session.status) ||
            attempted.current.has(attemptKey)
          )
            continue;
          // A submitted request can outlive this lease. Never automatically replay it.
          attempted.current.add(attemptKey);
          try {
            const result = await agentApi.startSession(tenant.id, currentBrand.id, id);
            if (!current()) return;
            if (
              result.id !== id ||
              result.tenant_id !== tenant.id ||
              result.brand_id !== currentBrand.id
            )
              return;
            acknowledged.push(result);
          } catch (error) {
            if (!current()) return;
            console.error(`Failed to auto-restart agent ${id}:`, error);
          }
        }
        if (!current()) return;
        // Use the acknowledged states before recording the next restart snapshot.
        // An immediate refetch could replace them with an older stopped snapshot.
        queryClient.setQueryData<AgentSession[]>(
          queryKeys.sessions.list(tenant.id, currentBrand.id),
          (existing) =>
            existing?.map((item) =>
              item.tenant_id === tenant.id && item.brand_id === currentBrand.id
                ? (acknowledged.find((result) => result.id === item.id) ?? item)
                : item
            )
        );
        run.settled = true;
        markRecovered();
      } catch (error) {
        if (current()) {
          recovery.current = null; // A later successful session refresh may retry the read.
          console.error('Failed to restore running agents:', error);
        }
      } finally {
        // A temporary query error must not leave recovery permanently occupied.
        if (!run.settled && recovery.current === run && !currentOwner()) recovery.current = null;
      }
    };
    void restoreAgents();
  }, [
    autoRestart,
    preferencesReady,
    autoStartEnabled,
    isSuccess,
    sessions,
    tenant,
    currentBrand,
    currentOwner,
    queryClient,
  ]);

  useEffect(() => {
    const api = window.electronAPI;
    if (
      !api ||
      !tenant?.id ||
      !currentBrand?.id ||
      !preferencesReady ||
      !isSuccess ||
      !currentOwner()
    )
      return;
    const version = lifecycle.current.version;
    // Do not erase saved IDs with the empty/loading or pre-restoration session list.
    if (
      autoRestart &&
      autoStartEnabled &&
      (recovery.current?.version !== version || !recovery.current.settled)
    )
      return;
    const sequence = ++persistenceVersion.current;
    const current = () =>
      currentOwner() &&
      lifecycle.current.version === version &&
      persistenceVersion.current === sequence;
    const write = runningAgentWrites.then(async () => {
      if (!current()) return;
      const key = getRunningAgentsKey(tenant.id, currentBrand.id);
      const stored = await api.store.get('runningAgents');
      if (!current()) return;
      const latest =
        queryClient.getQueryData<AgentSession[]>(
          queryKeys.sessions.list(tenant.id, currentBrand.id)
        ) ?? [];
      const runningIds = [
        ...new Set(
          latest
            .filter(
              (item) =>
                item.tenant_id === tenant.id &&
                item.brand_id === currentBrand.id &&
                item.status === 'running'
            )
            .map((item) => item.id)
        ),
      ];
      const map = normalizeRunningAgentsMap(stored, key);
      // A tenant-wide list may include other brands. Preserve saved IDs if a
      // conflicting record attributes one of this brand's IDs to another brand.
      if (latest.some((item) => map[key]?.includes(item.id) && item.brand_id !== currentBrand.id))
        return;
      map[key] = runningIds;
      if ((await api.store.set('runningAgents', map)) !== true)
        throw new Error('Restart snapshot was not acknowledged');
    });
    runningAgentWrites = write.catch(() => {});
  }, [
    sessions,
    tenant?.id,
    currentBrand?.id,
    preferencesReady,
    isSuccess,
    autoRestart,
    autoStartEnabled,
    currentOwner,
    recoveryRevision,
    queryClient,
  ]);

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
