import { useState, useEffect, useCallback } from 'react';
import type { ChatConversation } from '../../../types';

const STORAGE_KEY = 'chatPlaygroundConversations';
const MAX_CONVERSATIONS = 50;

export function useChatHistory() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from electron store
  useEffect(() => {
    const load = async () => {
      try {
        if (typeof window.electronAPI !== 'undefined') {
          const stored = await window.electronAPI.store.get(STORAGE_KEY);
          if (Array.isArray(stored)) {
            setConversations(stored as ChatConversation[]);
          }
        }
      } catch {
        // Ignore load errors
      }
      setIsLoaded(true);
    };
    load();
  }, []);

  const persist = useCallback(async (convos: ChatConversation[]) => {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        await window.electronAPI.store.set(STORAGE_KEY, convos.slice(0, MAX_CONVERSATIONS));
      }
    } catch {
      // Best effort
    }
  }, []);

  const addConversation = useCallback(
    (conversation: ChatConversation) => {
      setConversations((prev) => {
        const updated = [conversation, ...prev].slice(0, MAX_CONVERSATIONS);
        void persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const updateConversation = useCallback(
    (id: string, updates: Partial<ChatConversation>) => {
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        );
        void persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        void persist(updated);
        return updated;
      });
    },
    [persist]
  );

  return {
    conversations,
    isLoaded,
    addConversation,
    updateConversation,
    deleteConversation,
  };
}
