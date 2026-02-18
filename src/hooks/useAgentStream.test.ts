/**
 * Tests for the useAgentStream hook logic.
 */
import { describe, it, expect } from 'vitest';
import { buildStreamAuthCandidates, parseEventChunk } from './useAgentStream';

// Event parsing and normalization are validated against the parser helpers used by the hook.

describe('useAgentStream logic', () => {
  describe('event type normalization', () => {
    it('normalizes status event to status_changed', () => {
      const raw = 'event: status\n' + 'data: {"type":"status","status":"running"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events[0]).toMatchObject({ type: 'status_changed', status: 'running' });
    });

    it('normalizes event header with whitespace', () => {
      const raw = 'event:   status   \n' + 'data: {"type":"status","status":"running"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events[0]).toMatchObject({ type: 'status_changed', status: 'running' });
    });

    it('leaves non-status events unchanged', () => {
      const raw =
        'event: message\n' +
        'data: {"type":"message","id":"msg-1","role":"assistant","content":"Hi"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events[0]).toMatchObject({ type: 'message', role: 'assistant', content: 'Hi' });
    });

    it('drops events without type', () => {
      const raw = 'data: {"note":"missing type"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('drops status_changed events without status field', () => {
      const raw = 'event: status\n' + 'data: {"type":"status_changed"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('drops message events missing required id', () => {
      const raw =
        'event: message\n' +
        'data: {"type":"message","id":"","role":"assistant","content":"Hi"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('drops tool_call events missing arguments or id', () => {
      const raw =
        'event: tool_call\n' + 'data: {"type":"tool_call","id":"tc-1","tool_name":"search"}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('drops non-object payloads', () => {
      const raw = 'data: []\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('drops malformed JSON payloads', () => {
      const raw = 'data: {"type":"message","content":"Hi"\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });
  });

  describe('event stream chunking', () => {
    it('parses expected SSE event types', () => {
      const chunk =
        'event: status\n' +
        'data: {"type":"status","status":"running","message":"started"}\n\n' +
        'event: message\n' +
        'data: {"type":"message","id":"msg-1","role":"assistant","content":"Hello"}\n\n' +
        'event: tool_result\n' +
        'data: {"type":"tool_result","tool_call_id":"tc-1","success":true,"duration_ms":120,"result":{}}\n\n';

      const parsed = parseEventChunk(chunk);
      expect(parsed.events).toHaveLength(3);
      expect(parsed.events[0].type).toBe('status_changed');
      expect(parsed.events[1].type).toBe('message');
      expect(parsed.events[2].type).toBe('tool_result');
      expect(parsed.remainder).toBe('');
    });

    it('drops tool_result events missing required fields', () => {
      const raw =
        'event: tool_result\n' +
        'data: {"type":"tool_result","tool_call_id":"tc-1","result":{},"success":"true","duration_ms":120}\n\n';
      const parsed = parseEventChunk(raw);
      expect(parsed.events).toHaveLength(0);
    });

    it('keeps incomplete SSE payload in the remainder', () => {
      const chunk = 'event: message\n' + 'data: {"type":"message","content":"part';
      const parsed = parseEventChunk(chunk);
      expect(parsed.events).toHaveLength(0);
      expect(parsed.remainder).toBe(chunk);
    });
  });

  describe('auth candidates', () => {
    it('normalizes whitespace and keeps token candidates distinct from api key candidates', () => {
      const candidates = buildStreamAuthCandidates(' token-123 ', ' api-key-456 ', true);
      expect(candidates).toEqual([
        { headers: { Authorization: 'Bearer token-123' }, description: 'Bearer stream token' },
        { headers: { Authorization: 'ApiKey token-123' }, description: 'ApiKey stream token' },
        { headers: { Authorization: 'ApiKey api-key-456' }, description: 'API key' },
      ]);
    });

    it('does not duplicate identical ApiKey candidates', () => {
      const candidates = buildStreamAuthCandidates('same-token', 'same-token', true);
      expect(candidates).toEqual([
        { headers: { Authorization: 'Bearer same-token' }, description: 'Bearer stream token' },
        { headers: { Authorization: 'ApiKey same-token' }, description: 'ApiKey stream token' },
      ]);
    });

    it('extracts stream auth candidates in secure order', () => {
      const candidates = buildStreamAuthCandidates('token-123', 'api-key-456', true);
      expect(candidates).toEqual([
        { headers: { Authorization: 'Bearer token-123' }, description: 'Bearer stream token' },
        { headers: { Authorization: 'ApiKey token-123' }, description: 'ApiKey stream token' },
        { headers: { Authorization: 'ApiKey api-key-456' }, description: 'API key' },
      ]);
    });

    it('uses api key only when no token is available', () => {
      const candidates = buildStreamAuthCandidates(null, 'api-key-456', true);
      expect(candidates).toEqual([
        { headers: { Authorization: 'ApiKey api-key-456' }, description: 'API key' },
      ]);
    });

    it('skips API key candidates when disabled by config', () => {
      const candidates = buildStreamAuthCandidates('token-123', 'api-key-456', false);
      expect(candidates).toEqual([
        { headers: { Authorization: 'Bearer token-123' }, description: 'Bearer stream token' },
        { headers: { Authorization: 'ApiKey token-123' }, description: 'ApiKey stream token' },
      ]);
    });
  });

  describe('reconnect backoff logic', () => {
    it('exponential backoff doubles with each attempt', () => {
      const baseDelay = 100;
      const maxDelay = 1000;

      const delays = [1, 2, 3, 4, 5].map((attempt) =>
        Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      );

      expect(delays[0]).toBe(200);
      expect(delays[1]).toBe(400);
      expect(delays[2]).toBe(800);
      expect(delays[3]).toBe(1000);
      expect(delays[4]).toBe(1000);
    });
  });

  describe('MAX_EVENTS circular buffer logic', () => {
    it('caps at MAX_EVENTS by slicing from front', () => {
      const MAX_EVENTS = 100;
      let events = Array.from({ length: MAX_EVENTS }, (_, i) => ({ _id: `${i}` }));

      const newEvent = { _id: 'new' };
      if (events.length >= MAX_EVENTS) {
        events = [...events.slice(1), newEvent];
      } else {
        events = [...events, newEvent];
      }

      expect(events).toHaveLength(MAX_EVENTS);
      expect(events[0]._id).toBe('1');
      expect(events[events.length - 1]._id).toBe('new');
    });
  });

  describe('typing indicator logic', () => {
    it('thinking event sets typing, message clears it', () => {
      let isTyping = false;

      const handleEvent = (event: { type: string }) => {
        if (event.type === 'thinking') isTyping = true;
        if (event.type === 'message') isTyping = false;
        if (event.type === 'error') isTyping = false;
        if (event.type === 'status_changed') isTyping = false;
      };

      handleEvent({ type: 'thinking' });
      expect(isTyping).toBe(true);

      handleEvent({ type: 'message' });
      expect(isTyping).toBe(false);
    });
  });

  describe('metrics parsing', () => {
    it('extracts metrics from event data', () => {
      const event = {
        type: 'metrics',
        loop_count: 5,
        tokens_used: 1000,
        tool_calls: 3,
        uptime_seconds: 120,
      };

      const metrics = {
        loop_count: event.loop_count,
        tokens_used: event.tokens_used,
        tool_calls: event.tool_calls,
        errors: 0,
        messages_sent: 0,
        uptime_seconds: event.uptime_seconds,
      };

      expect(metrics.loop_count).toBe(5);
      expect(metrics.tokens_used).toBe(1000);
      expect(metrics.uptime_seconds).toBe(120);
    });
  });
});
