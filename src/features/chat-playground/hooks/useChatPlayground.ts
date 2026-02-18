import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../../../stores/auth';
import { agentApi } from '../../../lib/api';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import type { ChatMessage, ChatConversation } from '../../../types';

interface UseChatPlaygroundOptions {
  onError?: (message: string) => void;
}

export function useChatPlayground(options: UseChatPlaygroundOptions = {}) {
  const { tenant, currentBrand } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCreatedRef = useRef(false);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;

    const tid = requireTenantId(tenant);
    const bid = requireBrandId(currentBrand);

    const session = await agentApi.createSession(tid, bid, 'interactive', {
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      loop_interval_ms: 1000,
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: false,
      mcp_servers: [],
    });

    await agentApi.startSession(tid, bid, session.id);
    setActiveSessionId(session.id);
    sessionCreatedRef.current = true;
    return session.id;
  }, [activeSessionId, tenant, currentBrand]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const start = performance.now();
      try {
        const sessionId = await ensureSession();
        const tid = requireTenantId(tenant);
        const bid = requireBrandId(currentBrand);

        await agentApi.sendMessage(tid, bid, sessionId, content.trim());

        // The response comes through SSE in a real setup.
        // For the playground, we add a placeholder that gets replaced by stream events.
        const durationMs = Math.round(performance.now() - start);
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Message sent to agent. Responses will appear in the Agent Console.',
          timestamp: Date.now(),
          durationMs,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
        options.onError?.(errorMsg);

        const errorChatMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${errorMsg}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorChatMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [ensureSession, tenant, currentBrand, options]
  );

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setMessages(conversation.messages);
    setActiveSessionId(null);
    sessionCreatedRef.current = false;
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    sessionCreatedRef.current = false;
  }, []);

  const currentConversation: Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt'> = {
    title: messages.length > 0 ? messages[0].content.slice(0, 60) : 'New Chat',
    agentType: 'interactive',
    messages,
  };

  return {
    messages,
    isLoading,
    activeSessionId,
    sendMessage,
    loadConversation,
    startNewChat,
    currentConversation,
  };
}
