import type { AgentEvent, AgentSessionStatus } from '../types';

export const STREAM_EVENT_TYPES = new Set([
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

export const STREAM_STATUSES = new Set<AgentSessionStatus>([
  'starting',
  'running',
  'paused',
  'stopping',
  'stopped',
  'failed',
]);

export const STREAM_MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);
export const STREAM_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseEventType(rawEventName: string, rawData: string): AgentEvent | null {
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
        ...(isPlainObject(parsed.metadata)
          ? { metadata: parsed.metadata as Record<string, unknown> }
          : {}),
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
