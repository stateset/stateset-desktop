import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentEvent, AgentSessionStatus, AgentSessionMetrics } from '../types';
import { useAuthStore } from '../stores/auth';
import { agentApi } from '../lib/api';
import { API_CONFIG } from '../config/api.config';

const MAX_EVENTS = API_CONFIG.stream.maxEvents;
const MAX_MESSAGES = API_CONFIG.stream.maxMessages;
const STREAM_EVENT_TYPES = new Set([
  'status',
  'status_changed',
  'thinking',
  'message',
  'tool_call',
  'tool_result',
  'log',
  'error',
  'metrics',
  'heartbeat',
]);

const STREAM_STATUSES = new Set<AgentSessionStatus>([
  'starting',
  'running',
  'paused',
  'stopping',
  'stopped',
  'failed',
]);
const STREAM_MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);
const STREAM_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const MAX_RECONNECT_JITTER = 0.1;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const calculateReconnectDelay = (attempt: number): number => {
  const rawDelay = Math.min(
    API_CONFIG.stream.reconnectBaseDelay * Math.pow(2, attempt),
    API_CONFIG.stream.reconnectMaxDelay
  );
  const jitter = rawDelay * MAX_RECONNECT_JITTER * (Math.random() - 0.5) * 2;
  return Math.max(API_CONFIG.stream.reconnectBaseDelay, Math.round(rawDelay + jitter));
};

const normalizeStreamStatusErrorMessage = (status: number | null): string => {
  if (!status) {
    return 'Stream request failed. Please try again later.';
  }

  if (status === 401 || status === 403) {
    return 'Stream authentication failed. Check API credentials and token permissions.';
  }

  if (status >= 500) {
    return `Stream request failed (server error HTTP ${status}).`;
  }

  if (status === 404) {
    return 'Stream endpoint unavailable. Please try again later.';
  }

  return `Stream request failed (HTTP ${status}).`;
};

type StreamAuthCandidate = {
  headers: Record<string, string>;
  query: Record<string, string>;
  description: string;
};

const shouldAllowApiKeyInStreamHeader = (): boolean => {
  const raw = import.meta.env.VITE_ALLOW_STREAM_API_KEY;
  if (typeof raw !== 'string') {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const buildStreamUrl = (baseUrl: string, query: Record<string, string>): string => {
  const entries = Object.entries(query).filter(([, value]) => Boolean(value));
  if (!entries.length) {
    return baseUrl;
  }

  try {
    const nextUrl = new URL(baseUrl);
    entries.forEach(([key, value]) => {
      nextUrl.searchParams.set(key, value);
    });
    return nextUrl.toString();
  } catch (error) {
    void error;
    const queryString = entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryString}`;
  }
};

export function buildStreamAuthCandidates(
  token: string | null,
  apiKey: string | null
): StreamAuthCandidate[];

export function buildStreamAuthCandidates(
  token: string | null,
  apiKey: string | null,
  allowApiKeyFallback: boolean
): StreamAuthCandidate[];

export function buildStreamAuthCandidates(
  token: string | null,
  apiKey: string | null,
  allowApiKeyFallback?: boolean
): StreamAuthCandidate[] {
  const candidates: StreamAuthCandidate[] = [];
  const seenSignatures = new Set<string>();
  const isApiKeyFallbackEnabled =
    typeof allowApiKeyFallback === 'boolean'
      ? allowApiKeyFallback
      : shouldAllowApiKeyInStreamHeader();

  const sanitize = (value: string | null): string | null => {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  };

  const addCandidate = (
    description: string,
    headers: Record<string, string>,
    query: Record<string, string> = {}
  ): void => {
    const normalizedHeaders = Object.entries(headers)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    const normalizedQuery = Object.entries(query)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    const signature = JSON.stringify({ headers: normalizedHeaders, query: normalizedQuery });

    if (seenSignatures.has(signature)) {
      return;
    }
    seenSignatures.add(signature);
    candidates.push({ description, headers, query: normalizedQuery });
  };

  const tokenValue = sanitize(token);
  if (tokenValue) {
    addCandidate('Stream token', {}, { token: tokenValue });
    addCandidate('Stream token (alias)', {}, { stream_token: tokenValue });
  }

  const apiKeyValue = sanitize(apiKey);
  if (isApiKeyFallbackEnabled && apiKeyValue) {
    addCandidate('API key query', {}, { api_key: apiKeyValue });
    addCandidate('API key header', { Authorization: `ApiKey ${apiKeyValue}` });
    addCandidate('Bearer API key header', { Authorization: `Bearer ${apiKeyValue}` });
  }

  return candidates;
}

function parseEventType(rawEventName: string, rawData: string): AgentEvent | null {
  try {
    if (!rawData.trim()) {
      return null;
    }

    const parsed = JSON.parse(rawData);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const eventType =
      rawEventName.trim() === 'status' ||
      parsed.type === 'status' ||
      parsed.type === 'status_changed'
        ? 'status_changed'
        : typeof parsed.type === 'string'
          ? parsed.type
          : '';

    if (!STREAM_EVENT_TYPES.has(eventType)) {
      return null;
    }

    if (eventType === 'status_changed') {
      if (!STREAM_STATUSES.has(parsed.status as AgentSessionStatus)) {
        return null;
      }

      return {
        type: 'status_changed',
        status: parsed.status as AgentSessionStatus,
        ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
      };
    }

    if (eventType === 'thinking') {
      if (typeof parsed.content !== 'string') {
        return null;
      }
      return { type: 'thinking', content: parsed.content };
    }

    if (eventType === 'message') {
      if (
        typeof parsed.id !== 'string' ||
        !parsed.id ||
        typeof parsed.content !== 'string' ||
        typeof parsed.role !== 'string' ||
        !STREAM_MESSAGE_ROLES.has(parsed.role)
      ) {
        return null;
      }

      return {
        type: 'message',
        id: parsed.id,
        role: parsed.role as 'user' | 'assistant' | 'system',
        content: parsed.content,
      };
    }

    if (eventType === 'tool_call') {
      if (typeof parsed.tool_name !== 'string' || !parsed.tool_name) {
        return null;
      }
      if (typeof parsed.id !== 'string' || !parsed.id) {
        return null;
      }
      if (!isPlainObject(parsed.arguments)) {
        return null;
      }

      return {
        type: 'tool_call',
        id: parsed.id,
        tool_name: parsed.tool_name,
        arguments: parsed.arguments as Record<string, unknown>,
      };
    }

    if (eventType === 'tool_result') {
      const toolCallId =
        typeof parsed.tool_call_id === 'string' && parsed.tool_call_id ? parsed.tool_call_id : '';

      if (
        !toolCallId ||
        typeof parsed.success !== 'boolean' ||
        !isFiniteNumber(parsed.duration_ms) ||
        !Object.prototype.hasOwnProperty.call(parsed, 'result')
      ) {
        return null;
      }

      return {
        type: 'tool_result',
        tool_call_id: toolCallId,
        result: parsed.result,
        success: parsed.success,
        duration_ms: parsed.duration_ms as number,
      };
    }

    if (eventType === 'log') {
      if (
        typeof parsed.level !== 'string' ||
        !STREAM_LOG_LEVELS.has(parsed.level) ||
        typeof parsed.message !== 'string'
      ) {
        return null;
      }

      return {
        type: 'log',
        level: parsed.level as 'debug' | 'info' | 'warn' | 'error',
        message: parsed.message,
      };
    }

    if (eventType === 'error') {
      if (
        typeof parsed.code !== 'string' ||
        !parsed.code ||
        typeof parsed.message !== 'string' ||
        typeof parsed.recoverable !== 'boolean'
      ) {
        return null;
      }

      return {
        type: 'error',
        code: parsed.code,
        message: parsed.message,
        recoverable: parsed.recoverable,
      };
    }

    if (eventType === 'metrics') {
      if (
        !isFiniteNumber(parsed.loop_count) ||
        !isFiniteNumber(parsed.tokens_used) ||
        !isFiniteNumber(parsed.tool_calls) ||
        !isFiniteNumber(parsed.uptime_seconds)
      ) {
        return null;
      }

      return {
        type: 'metrics',
        loop_count: parsed.loop_count as number,
        tokens_used: parsed.tokens_used as number,
        tool_calls: parsed.tool_calls as number,
        uptime_seconds: parsed.uptime_seconds as number,
      };
    }

    if (eventType === 'heartbeat') {
      if (typeof parsed.timestamp !== 'string') {
        return null;
      }
      return { type: 'heartbeat', timestamp: parsed.timestamp };
    }

    return null;
  } catch (err) {
    console.error('Failed to parse SSE event payload:', err);
    return null;
  }
}

export function parseEventChunk(chunk: string): { events: AgentEvent[]; remainder: string } {
  const events: AgentEvent[] = [];
  const normalizedChunk = chunk.replace(/\r/g, '');
  const delimiter = '\n\n';
  let cursor = 0;
  const blocks: string[] = [];

  while (cursor < normalizedChunk.length) {
    const nextDelimiter = normalizedChunk.indexOf(delimiter, cursor);
    if (nextDelimiter === -1) {
      break;
    }

    blocks.push(normalizedChunk.slice(cursor, nextDelimiter));
    cursor = nextDelimiter + delimiter.length;
  }

  const remainder = normalizedChunk.slice(cursor);

  for (const block of blocks) {
    const lines = block.replace(/\r/g, '').split('\n');
    let eventName = 'message';
    let data = '';

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      const index = line.indexOf(':');
      if (index === -1) continue;

      const field = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();

      if (field === 'event') {
        eventName = value || eventName;
      } else if (field === 'data') {
        data = data ? `${data}\n${value}` : value;
      }
    }

    if (!data) continue;

    const event = parseEventType(eventName, data);
    if (event) {
      events.push(event);
    }
  }

  return { events, remainder };
}

export type StreamEvent = AgentEvent & { _id: string; _timestamp: number };

export interface PendingApproval {
  sessionId: string;
  reason: string;
  details: Record<string, unknown>;
}

interface UseAgentStreamOptions {
  tenantId: string;
  brandId: string;
  sessionId: string;
  onEvent?: (event: AgentEvent) => void;
  onError?: (message: string) => void;
  autoReconnect?: boolean;
}

interface UseAgentStreamResult {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  events: StreamEvent[];
  messages: StreamEvent[];
  status: AgentSessionStatus | null;
  metrics: AgentSessionMetrics | null;
  isTyping: boolean;
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
}

export function useAgentStream({
  tenantId,
  brandId,
  sessionId,
  onEvent,
  onError,
  autoReconnect = true,
}: UseAgentStreamOptions): UseAgentStreamResult {
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectAttemptRef = useRef(0);
  const lastErrorRef = useRef<string | null>(null);
  const connectRequestedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);
  const onEventRef = useRef<UseAgentStreamOptions['onEvent']>(onEvent);
  const onErrorRef = useRef<UseAgentStreamOptions['onError']>(onError);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [messages, setMessages] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<AgentSessionStatus | null>(null);
  const [metrics, setMetrics] = useState<AgentSessionMetrics | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const apiKey = useAuthStore((state) => state.apiKey);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const teardownStream = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (streamReaderRef.current) {
      void streamReaderRef.current.cancel();
      streamReaderRef.current = null;
    }

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsTyping(false);
  }, [clearReconnectTimer]);

  const createStreamId = useCallback((): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  // Keep callbacks in refs to avoid reconnect churn on re-renders.
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const setStreamError = useCallback((message: string, notify = true) => {
    setError(message);
    if (notify && lastErrorRef.current !== message) {
      lastErrorRef.current = message;
      onErrorRef.current?.(message);
    }
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const streamEvent = { ...event, _id: createStreamId(), _timestamp: Date.now() };

      setEvents((prev) => {
        if (prev.length >= MAX_EVENTS) {
          return [...prev.slice(1), streamEvent];
        }
        return [...prev, streamEvent];
      });

      // Handle specific event types
      switch (event.type) {
        case 'status_changed':
          setStatus(event.status);
          // Reset typing state on status change
          setIsTyping(false);
          break;
        case 'thinking':
          // Agent is thinking - set typing indicator
          setIsTyping(true);
          // Auto-clear typing after timeout
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 30000);
          setMessages((prev) => {
            const next = [...prev, streamEvent];
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
          break;
        case 'message':
          // Message received - clear typing indicator
          setIsTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          setMessages((prev) => {
            const next = [...prev, streamEvent];
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
          break;
        case 'tool_call':
        case 'tool_result':
          setMessages((prev) => {
            const next = [...prev, streamEvent];
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
          break;
        case 'log':
          if (event.level !== 'debug') {
            setMessages((prev) => {
              const next = [...prev, streamEvent];
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
          }
          break;
        case 'metrics':
          setMetrics({
            loop_count: event.loop_count,
            tokens_used: event.tokens_used,
            tool_calls: event.tool_calls,
            errors: 0,
            messages_sent: 0,
            uptime_seconds: event.uptime_seconds,
          });
          break;
        case 'error':
          setIsTyping(false);
          if (!event.recoverable) {
            setStreamError(event.message);
          }
          setMessages((prev) => {
            const next = [...prev, streamEvent];
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
          break;
      }

      // Call external handler
      onEventRef.current?.(event);
    },
    [createStreamId, setStreamError]
  );

  const connect = useCallback(() => {
    if (sessionId && lastSessionIdRef.current !== sessionId) {
      lastSessionIdRef.current = sessionId;
      hasConnectedRef.current = false;
      reconnectAttemptsRef.current = 0;
    }
    const wasRequested = connectRequestedRef.current;
    connectRequestedRef.current = true;
    if (!wasRequested) {
      reconnectAttemptsRef.current = 0;
    }
    clearReconnectTimer();
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }

    const attemptId = ++connectAttemptRef.current;
    const isCurrentAttempt = () => attemptId === connectAttemptRef.current;

    setIsConnecting(true);
    setError(null);
    const scheduleReconnect = () => {
      if (autoReconnect && reconnectAttemptsRef.current < API_CONFIG.stream.maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
        const message = hasConnectedRef.current
          ? `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`
          : 'Stream not ready. Waiting for agent to start...';
        setStreamError(message, reconnectAttemptsRef.current === 1);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
        return true;
      }

      setStreamError(
        hasConnectedRef.current
          ? 'Connection lost. Please refresh to reconnect.'
          : 'Stream unavailable. Please try again later.'
      );
      return false;
    };

    void (async () => {
      if (!isCurrentAttempt()) {
        return;
      }

      if (!tenantId || !brandId || !sessionId) {
        setStreamError('Missing session context for streaming.');
        setIsConnecting(false);
        return;
      }

      const allowApiKeyFallback = shouldAllowApiKeyInStreamHeader();
      const token = await agentApi.getStreamToken(tenantId, brandId, sessionId);

      if (!isCurrentAttempt() || !connectRequestedRef.current) {
        return;
      }

      if (!token && !apiKey) {
        setStreamError('Secure stream token unavailable.');
        setIsConnecting(false);
        return;
      }

      const streamUrl = agentApi.getStreamUrl(tenantId, brandId, sessionId);
      const streamController = new AbortController();
      streamAbortRef.current = streamController;

      const shouldTryApiKeyFallback = allowApiKeyFallback || token === null;
      const streamAuthCandidates = buildStreamAuthCandidates(
        token,
        apiKey,
        shouldTryApiKeyFallback
      );
      let response: Response | null = null;
      let lastResponseStatus: number | null = null;
      let hadUnauthorizedResponse = false;

      for (const candidate of streamAuthCandidates) {
        if (!isCurrentAttempt() || !connectRequestedRef.current) {
          return;
        }
        const streamUrlWithAuth = buildStreamUrl(streamUrl, candidate.query);
        const headers = {
          Accept: 'text/event-stream',
          ...candidate.headers,
        };

        try {
          const streamResponse = await fetch(streamUrlWithAuth, {
            signal: streamController.signal,
            headers,
          });

          if (streamResponse.ok) {
            response = streamResponse;
            break;
          }
          lastResponseStatus = streamResponse.status;
          if (streamResponse.status === 401 || streamResponse.status === 403) {
            hadUnauthorizedResponse = true;
          }

          void streamResponse.body?.cancel();

          if (streamResponse.status !== 401 && streamResponse.status !== 403) {
            break;
          }
        } catch (streamError) {
          if (streamError instanceof DOMException && streamError.name === 'AbortError') {
            return;
          }
          if (!isCurrentAttempt() || !connectRequestedRef.current) {
            return;
          }
          console.error(`Failed to open stream with ${candidate.description}:`, streamError);
          if (!autoReconnect) {
            setStreamError('Stream connection failed. Please try again later.');
            setIsConnecting(false);
            return;
          }
        }
      }

      if (!response || !isCurrentAttempt() || !connectRequestedRef.current) {
        if (isCurrentAttempt() && connectRequestedRef.current) {
          if (hadUnauthorizedResponse) {
            setStreamError(normalizeStreamStatusErrorMessage(lastResponseStatus ?? 401));
            setIsConnecting(false);
            setIsConnected(false);
            if (streamAbortRef.current === streamController) {
              streamAbortRef.current = null;
            }
            return;
          }
          setStreamError(normalizeStreamStatusErrorMessage(lastResponseStatus));
        }
        setIsConnecting(false);
        scheduleReconnect();
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
        return;
      }

      if (!response.ok) {
        const status = response?.status ?? lastResponseStatus ?? null;
        const isAuthError = status === 401 || status === 403;
        setStreamError(normalizeStreamStatusErrorMessage(status));
        setIsConnecting(false);
        if (isAuthError) {
          setIsConnected(false);
        }
        if (!isAuthError) {
          scheduleReconnect();
        }
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setStreamError('Stream response had no readable body.');
        setIsConnecting(false);
        scheduleReconnect();
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
        return;
      }

      streamReaderRef.current = reader;
      lastErrorRef.current = null;
      clearReconnectTimer();
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      reconnectAttemptsRef.current = 0;
      hasConnectedRef.current = true;

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (isCurrentAttempt() && connectRequestedRef.current) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }

          const parsedChunk = parseEventChunk(buffer);
          buffer = parsedChunk.remainder;
          if (parsedChunk.events.length > 0) {
            parsedChunk.events.forEach((event) => {
              if (!isCurrentAttempt()) {
                return;
              }
              handleEvent(event);
            });
          }
        }

        const tail = decoder.decode();
        if (tail) {
          buffer += tail;
        }

        const remainingEvents = parseEventChunk(buffer + '\n\n').events;
        remainingEvents.forEach((event) => {
          if (!isCurrentAttempt()) {
            return;
          }
          handleEvent(event);
        });

        if (!isCurrentAttempt() || !connectRequestedRef.current) {
          return;
        }

        setIsConnected(false);
        setIsConnecting(false);

        if (scheduleReconnect()) {
          return;
        }
      } catch (streamError) {
        if (streamAbortRef.current !== streamController) {
          return;
        }

        if (streamError instanceof DOMException && streamError.name === 'AbortError') {
          return;
        }

        console.error('SSE stream error:', streamError);

        if (!isCurrentAttempt() || !connectRequestedRef.current) {
          return;
        }

        setIsConnected(false);
        setIsConnecting(false);

        const didScheduleReconnect = scheduleReconnect();
        if (didScheduleReconnect) {
          return;
        }

        return;
      } finally {
        if (streamReaderRef.current === reader) {
          streamReaderRef.current = null;
        }
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
      }
    })();
  }, [
    tenantId,
    brandId,
    sessionId,
    apiKey,
    autoReconnect,
    handleEvent,
    setStreamError,
    clearReconnectTimer,
  ]);

  const disconnect = useCallback(() => {
    connectRequestedRef.current = false;
    connectAttemptRef.current += 1;
    teardownStream();
  }, [teardownStream]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    const handleOnline = () => {
      if (autoReconnect && connectRequestedRef.current) {
        connect();
      }
    };

    const handleOffline = () => {
      if (connectRequestedRef.current) {
        connectAttemptRef.current += 1;
        teardownStream();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoReconnect, connect, teardownStream]);

  return {
    isConnected,
    isConnecting,
    error,
    events,
    messages,
    status,
    metrics,
    isTyping,
    connect,
    disconnect,
    clearEvents,
  };
}
