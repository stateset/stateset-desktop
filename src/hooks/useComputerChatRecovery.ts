import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth';
import { useComputerChatsStore } from '../features/computer-chat/store';
import { durableChatController } from '../features/computer-chat/durable';
import { terminalChat } from '../features/computer-chat/durableTypes';
import { useDurableWorkflowsStore } from '../stores/durableWorkflows';

const isOffline = () => navigator.onLine === false;

/** Read-only reconciliation; reconnecting never replays a computer action. */
export function useComputerChatRecovery() {
  const tenantId = useAuthStore((s) => s.tenant?.id);
  const brandId = useAuthStore((s) => s.currentBrand?.id);
  const engineUrl = useDurableWorkflowsStore((s) => s.engineUrl);
  const apiKey = useDurableWorkflowsStore((s) => s.apiKey);
  const connectionRevision = useDurableWorkflowsStore((s) => s.connectionRevision);
  const configuring = useDurableWorkflowsStore((s) => s.configuring);
  const previousConfiguration = useRef<{
    engineUrl: string;
    apiKey: string | null;
    connectionRevision: string | null;
  }>();
  const scheduler = useRef({
    inFlight: new Set<string>(),
    attempts: new Map<string, number>(),
    sequence: 0,
    starts: [] as number[],
  });
  useEffect(() => {
    const flush = () =>
      void useComputerChatsStore
        .getState()
        .flushDrafts()
        .catch(() => undefined);
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (!tenantId || !brandId || configuring) return;
    const changed =
      previousConfiguration.current !== undefined &&
      (previousConfiguration.current.engineUrl !== engineUrl ||
        previousConfiguration.current.apiKey !== apiKey ||
        previousConfiguration.current.connectionRevision !== connectionRevision);
    previousConfiguration.current = { engineUrl, apiKey, connectionRevision };
    let cancelled = false;
    let running = false;
    let forcePending = false;
    const forced = new Set<string>();
    const { inFlight, attempts } = scheduler.current;
    const poll = async (force = false) => {
      forcePending ||= force;
      if (cancelled || isOffline()) return;
      if (running) return;
      running = true;
      try {
        await Promise.all([
          useComputerChatsStore.getState().initialize(),
          useDurableWorkflowsStore.getState().initialize(),
        ]);
        if (
          cancelled ||
          isOffline() ||
          useDurableWorkflowsStore.getState().configuring ||
          useAuthStore.getState().tenant?.id !== tenantId ||
          useAuthStore.getState().currentBrand?.id !== brandId
        )
          return;
        const store = useComputerChatsStore.getState();
        if (forcePending) {
          for (const chat of store.chats) {
            if (chat.tenantId === tenantId && chat.brandId === brandId) forced.add(chat.id);
          }
          forcePending = false;
        }
        const candidates = store.chats.filter((chat) => {
          if (
            chat.tenantId !== tenantId ||
            chat.brandId !== brandId ||
            !chat.durableSession ||
            store.busy[chat.id] ||
            inFlight.has(chat.id)
          )
            return false;
          if (chat.durableSession.engineUrl !== useDurableWorkflowsStore.getState().engineUrl)
            return false;
          if (
            chat.serverState &&
            (terminalChat(chat.serverState.status) || chat.serverState.cleanup_verified) &&
            !chat.error &&
            !store.connections[chat.id]?.failures
          )
            return false;
          const connection = store.connections[chat.id];
          return (
            forced.has(chat.id) ||
            (connection?.status !== 'attention' &&
              (!connection?.nextRetryAt || connection.nextRetryAt <= Date.now()))
          );
        });
        // Rotate through eligible chats fairly. A stalled request occupies one
        // slot, but cannot hold up every other conversation in the library.
        candidates.sort(
          (a, b) =>
            (attempts.get(a.id) ?? 0) - (attempts.get(b.id) ?? 0) || a.id.localeCompare(b.id)
        );
        const now = Date.now();
        scheduler.current.starts = scheduler.current.starts.filter((at) => now - at < 3000);
        const capacity = Math.min(4 - inFlight.size, 4 - scheduler.current.starts.length);
        for (const candidate of candidates.slice(0, Math.max(0, capacity))) {
          attempts.set(candidate.id, ++scheduler.current.sequence);
          scheduler.current.starts.push(now);
          forced.delete(candidate.id);
          inFlight.add(candidate.id);
          void durableChatController
            .refresh(candidate.id)
            .catch(() => undefined)
            .finally(() => inFlight.delete(candidate.id));
        }
      } catch {
        // Initialization failures are retried on the next tick; no requests use
        // partially loaded identity or engine configuration.
      } finally {
        running = false;
      }
    };
    const reconnect = () => void poll(true);
    void poll(changed);
    const timer = setInterval(() => void poll(), 3000);
    window.addEventListener('online', reconnect);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', reconnect);
    };
  }, [tenantId, brandId, engineUrl, apiKey, connectionRevision, configuring]);
}
