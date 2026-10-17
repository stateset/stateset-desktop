import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../../../stores/auth';
import { agentApi } from '../../../lib/api';
import { stripToolPayloads } from '../toolActivity';
import { requireTenantId, requireBrandId } from '../../../lib/auth-guards';
import type { AgentSessionConfig, ChatMessage, ChatConversation } from '../../../types';

interface UseChatPlaygroundOptions {
  onError?: (message: string) => void;
  model?: string;
  temperature?: number;
  /** MCP servers the chat agent may call, by connection id. */
  mcpServers?: string[];
}

const NO_MCP_SERVERS: string[] = [];

export function useChatPlayground(options: UseChatPlaygroundOptions = {}) {
  const selectedModel = options.model ?? 'claude-sonnet-4-6';
  const selectedTemperature = options.temperature ?? 0.7;
  const mcpServers = options.mcpServers ?? NO_MCP_SERVERS;
  // Everything the live session's config can be changed from, in one key: a
  // model change alone must reach the session too, not only a server change.
  const configKey = [selectedModel, selectedTemperature, mcpServers.join(',')].join('|');
  const { tenant, currentBrand } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCreatedRef = useRef(false);
  const sessionConfigRef = useRef<AgentSessionConfig | null>(null);
  const appliedConfigKeyRef = useRef<string | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;

    const tid = requireTenantId(tenant);
    const bid = requireBrandId(currentBrand);

    const config: AgentSessionConfig = {
      model: selectedModel,
      temperature: selectedTemperature,
      loop_interval_ms: 1000,
      max_iterations: 50,
      iteration_timeout_secs: 300,
      pause_on_error: false,
      mcp_servers: mcpServers,
    };
    const session = await agentApi.createSession(tid, bid, 'interactive', config);

    await agentApi.startSession(tid, bid, session.id);
    setActiveSessionId(session.id);
    sessionCreatedRef.current = true;
    sessionConfigRef.current = config;
    appliedConfigKeyRef.current = configKey;
    return session.id;
  }, [
    activeSessionId,
    tenant,
    currentBrand,
    selectedModel,
    selectedTemperature,
    mcpServers,
    configKey,
  ]);

  /**
   * Brings the live session's config in line with what the config bar shows.
   *
   * Done lazily, right before a message is sent, rather than eagerly on every
   * change: an idle session's config does not matter, and doing it here means
   * there is only ever one such call in flight, tied to the session actually
   * being used. That removes the need to fence concurrent pushes, abandoned
   * sessions and failed retries.
   */
  const syncSessionConfig = useCallback(
    async (sessionId: string) => {
      const previousConfig = sessionConfigRef.current;
      if (!previousConfig || appliedConfigKeyRef.current === configKey) return;

      const config: AgentSessionConfig = {
        ...previousConfig,
        // Carry what the config bar currently shows; re-asserting the values the
        // session was created with would silently undo a model change.
        model: selectedModel,
        temperature: selectedTemperature,
        mcp_servers: mcpServers,
      };
      await agentApi.updateConfig(
        requireTenantId(tenant),
        requireBrandId(currentBrand),
        sessionId,
        config
      );
      // Only now is the session actually using this selection.
      sessionConfigRef.current = config;
      appliedConfigKeyRef.current = configKey;
    },
    [mcpServers, configKey, selectedModel, selectedTemperature, tenant, currentBrand]
  );

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * Applies `update` to the message with `id`. When none exists — a tool result
   * whose call was lost to a stream reconnect — `fallback` is appended instead,
   * so the transcript still records what happened.
   */
  const updateMessage = useCallback(
    (id: string, update: (message: ChatMessage) => ChatMessage, fallback?: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((message) => message.id === id)) {
          return prev.map((message) => (message.id === id ? update(message) : message));
        }
        return fallback ? [...prev, update(fallback)] : prev;
      });
    },
    []
  );

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

      try {
        const sessionId = await ensureSession();
        await syncSessionConfig(sessionId);
        const tid = requireTenantId(tenant);
        const bid = requireBrandId(currentBrand);

        await agentApi.sendMessage(tid, bid, sessionId, content.trim());
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
        setIsLoading(false);
      }
    },
    [ensureSession, syncSessionConfig, tenant, currentBrand, options]
  );

  const resetSession = useCallback(() => {
    setActiveSessionId(null);
    sessionCreatedRef.current = false;
    sessionConfigRef.current = null;
    appliedConfigKeyRef.current = null;
  }, []);

  const loadConversation = useCallback(
    (conversation: ChatConversation) => {
      setMessages(conversation.messages);
      resetSession();
    },
    [resetSession]
  );

  const startNewChat = useCallback(() => {
    setMessages([]);
    resetSession();
  }, [resetSession]);

  const currentConversation: Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt'> = {
    title: messages.length > 0 ? messages[0].content.slice(0, 60) : 'New Chat',
    agentType: 'interactive',
    // Saved transcripts keep what ran, not the arguments or results it carried.
    messages: stripToolPayloads(messages),
  };

  return {
    messages,
    isLoading,
    setIsLoading,
    activeSessionId,
    sendMessage,
    appendMessage,
    updateMessage,
    loadConversation,
    startNewChat,
    currentConversation,
  };
}
