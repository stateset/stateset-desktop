/** @vitest-environment happy-dom */
/**
 * Tests for the useAgentStream hook behavior: connection lifecycle, SSE event
 * accumulation, reconnect backoff, auth candidate fallback, and cleanup.
 *
 * Pure helper tests (parseEventChunk, buildStreamAuthCandidates) live in
 * useAgentStream.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentStream } from './useAgentStream';
import { agentApi } from '../lib/api';

// --- Mocks ---

const mockAuthState: { apiKey: string | null } = { apiKey: null };

vi.mock('../stores/auth', () => ({
  useAuthStore: (selector?: (s: { apiKey: string | null }) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}));

vi.mock('../lib/api', () => ({
  agentApi: {
    getStreamToken: vi.fn(),
    getStreamUrl: vi.fn(),
  },
}));

// Shrink stream limits so backoff and buffer-cap tests stay fast and deterministic.
vi.mock('../config/api.config', () => ({
  API_CONFIG: {
    baseUrl: 'https://api.test',
    timeout: 15000,
    maxRetries: 3,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    circuitBreaker: { maxFailures: 5, halfOpenTimeout: 30000, resetTimeout: 60000 },
    stream: {
      maxEvents: 5,
      maxMessages: 5,
      maxReconnectAttempts: 2,
      reconnectBaseDelay: 10,
      reconnectMaxDelay: 50,
    },
  },
}));

// --- SSE stream helpers ---

interface SseStream {
  body: ReadableStream<Uint8Array>;
  push: (text: string) => void;
  close: () => void;
  cancelled: () => boolean;
}

function createSseStream(): SseStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    body,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    cancelled: () => cancelled,
  };
}

const okResponse = (stream: SseStream): Response =>
  ({ ok: true, status: 200, body: stream.body }) as unknown as Response;

const failedResponse = (status: number): Response =>
  ({
    ok: false,
    status,
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
  }) as unknown as Response;

// --- Test harness ---

type StreamHookOptions = Parameters<typeof useAgentStream>[0];

let fetchMock: ReturnType<typeof vi.fn>;

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const pushChunk = (stream: SseStream, text: string) =>
  act(async () => {
    stream.push(text);
    await vi.advanceTimersByTimeAsync(0);
  });

const baseOptions = (): StreamHookOptions => ({
  tenantId: 'tenant-1',
  brandId: 'brand-1',
  sessionId: 'session-1',
});

async function renderConnected(overrides: Partial<StreamHookOptions> = {}) {
  const stream = createSseStream();
  fetchMock.mockResolvedValue(okResponse(stream));
  const utils = renderHook(() => useAgentStream({ ...baseOptions(), ...overrides }));
  act(() => utils.result.current.connect());
  await flush();
  expect(utils.result.current.isConnected).toBe(true);
  return { ...utils, stream };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Pin jitter to zero so reconnect delays are exactly base * 2^attempt.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockAuthState.apiKey = null;
  vi.mocked(agentApi.getStreamToken).mockResolvedValue('stream-tok');
  vi.mocked(agentApi.getStreamUrl).mockReturnValue('https://api.test/v1/stream');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAgentStream hook', () => {
  it('connects and reports isConnected once the SSE response opens', async () => {
    const stream = createSseStream();
    fetchMock.mockResolvedValue(okResponse(stream));

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    expect(result.current.isConnected).toBe(false);

    act(() => result.current.connect());
    expect(result.current.isConnecting).toBe(true);

    await flush();

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(agentApi.getStreamToken).toHaveBeenCalledWith('tenant-1', 'brand-1', 'session-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('token')).toBe('stream-tok');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
  });

  it('accumulates message and tool events and toggles typing state', async () => {
    const onEvent = vi.fn();
    const { result, stream } = await renderConnected({ onEvent });

    await pushChunk(stream, 'data: {"type":"thinking","content":"pondering"}\n\n');
    expect(result.current.isTyping).toBe(true);

    await pushChunk(
      stream,
      'data: {"type":"message","id":"m1","role":"assistant","content":"Hello"}\n\n'
    );
    expect(result.current.isTyping).toBe(false);

    await pushChunk(
      stream,
      'data: {"type":"tool_call","id":"tc1","tool_name":"search","arguments":{"q":"x"}}\n\n' +
        'data: {"type":"tool_result","tool_call_id":"tc1","success":true,"duration_ms":12,"result":{}}\n\n'
    );

    expect(result.current.messages.map((m) => m.type)).toEqual([
      'thinking',
      'message',
      'tool_call',
      'tool_result',
    ]);
    expect(result.current.events).toHaveLength(4);
    expect(result.current.messages[1]).toMatchObject({
      type: 'message',
      id: 'm1',
      role: 'assistant',
      content: 'Hello',
    });
    expect(typeof result.current.messages[0]._id).toBe('string');
    expect(typeof result.current.messages[0]._timestamp).toBe('number');
    expect(onEvent).toHaveBeenCalledTimes(4);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'message',
      id: 'm1',
      role: 'assistant',
      content: 'Hello',
    });
  });

  it('tracks status transitions and resets typing on status change', async () => {
    const { result, stream } = await renderConnected();

    await pushChunk(stream, 'event: status\ndata: {"type":"status","status":"running"}\n\n');
    expect(result.current.status).toBe('running');

    await pushChunk(stream, 'data: {"type":"thinking","content":"..."}\n\n');
    expect(result.current.isTyping).toBe(true);

    await pushChunk(stream, 'event: status\ndata: {"type":"status","status":"paused"}\n\n');
    expect(result.current.status).toBe('paused');
    expect(result.current.isTyping).toBe(false);

    await pushChunk(stream, 'data: {"type":"status_changed","status":"stopped"}\n\n');
    expect(result.current.status).toBe('stopped');
  });

  it('parses metrics events into session metrics', async () => {
    const { result, stream } = await renderConnected();

    await pushChunk(
      stream,
      'data: {"type":"metrics","loop_count":2,"tokens_used":50,"tool_calls":1,"uptime_seconds":9}\n\n'
    );

    expect(result.current.metrics).toEqual({
      loop_count: 2,
      tokens_used: 50,
      tool_calls: 1,
      errors: 0,
      messages_sent: 0,
      uptime_seconds: 9,
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('records heartbeat events without adding them to messages', async () => {
    const onEvent = vi.fn();
    const { result, stream } = await renderConnected({ onEvent });

    await pushChunk(
      stream,
      'event: heartbeat\ndata: {"type":"heartbeat","timestamp":"2026-06-11T00:00:00Z"}\n\n'
    );

    expect(onEvent).toHaveBeenCalledWith({ type: 'heartbeat', timestamp: '2026-06-11T00:00:00Z' });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]).toMatchObject({ type: 'heartbeat' });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });

  it('handles recoverable and fatal error events', async () => {
    const onError = vi.fn();
    const { result, stream } = await renderConnected({ onError });

    await pushChunk(
      stream,
      'data: {"type":"error","code":"E1","message":"transient blip","recoverable":true}\n\n'
    );
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({
      type: 'error',
      message: 'transient blip',
    });

    await pushChunk(
      stream,
      'data: {"type":"error","code":"E2","message":"fatal failure","recoverable":false}\n\n'
    );
    expect(result.current.error).toBe('fatal failure');
    expect(onError).toHaveBeenCalledWith('fatal failure');
    expect(result.current.messages).toHaveLength(2);
  });

  it('clears the typing indicator after the 30s thinking timeout', async () => {
    const { result, stream } = await renderConnected();

    await pushChunk(stream, 'data: {"type":"thinking","content":"hmm"}\n\n');
    expect(result.current.isTyping).toBe(true);

    await advance(30_000);
    expect(result.current.isTyping).toBe(false);
  });

  it('buffers partial SSE chunks across reads and filters debug logs from messages', async () => {
    const { result, stream } = await renderConnected();

    await pushChunk(stream, 'data: {"type":"message","id":"m1","role":"assistant","content":"He');
    expect(result.current.messages).toHaveLength(0);

    await pushChunk(stream, 'llo"}\n\n');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ content: 'Hello' });

    await pushChunk(
      stream,
      'data: {"type":"log","level":"debug","message":"noise"}\n\n' +
        'data: {"type":"log","level":"info","message":"signal"}\n\n'
    );
    expect(result.current.messages.map((m) => m.type)).toEqual(['message', 'log']);
    expect(result.current.messages[1]).toMatchObject({ level: 'info', message: 'signal' });
    // The debug log still lands in the raw events buffer.
    expect(result.current.events).toHaveLength(3);
  });

  it('caps events and messages buffers at the configured maximums', async () => {
    const { result, stream } = await renderConnected();

    const chunk = Array.from(
      { length: 8 },
      (_, i) => `data: {"type":"message","id":"m${i + 1}","role":"assistant","content":"c"}\n\n`
    ).join('');
    await pushChunk(stream, chunk);

    expect(result.current.events).toHaveLength(5);
    expect(result.current.messages).toHaveLength(5);
    expect(result.current.events[0]).toMatchObject({ id: 'm4' });
    expect(result.current.messages[0]).toMatchObject({ id: 'm4' });
    expect(result.current.messages[4]).toMatchObject({ id: 'm8' });
  });

  it('clearEvents empties accumulated events and messages', async () => {
    const { result, stream } = await renderConnected();

    await pushChunk(
      stream,
      'data: {"type":"message","id":"m1","role":"assistant","content":"Hi"}\n\n'
    );
    expect(result.current.events).toHaveLength(1);

    act(() => result.current.clearEvents());
    expect(result.current.events).toHaveLength(0);
    expect(result.current.messages).toHaveLength(0);
  });

  it('schedules reconnects with exponential backoff and gives up after max attempts', async () => {
    const streamA = createSseStream();
    fetchMock.mockResolvedValueOnce(okResponse(streamA));
    fetchMock.mockResolvedValue(failedResponse(500));
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream({ ...baseOptions(), onError }));
    act(() => result.current.connect());
    await flush();
    expect(result.current.isConnected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Server closes the stream -> first reconnect scheduled at base * 2^1 = 20ms.
    await act(async () => {
      streamA.close();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toMatch(/^Connection lost\. Reconnecting/);

    await advance(19);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // attempt 1 fired at exactly 20ms

    // Attempt 1 failed (HTTP 500) -> attempt 2 scheduled at base * 2^2 = 40ms.
    await advance(39);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(1);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3); // attempt 2 fired at exactly 40ms

    // Attempt 2 failed and maxReconnectAttempts (2) is exhausted -> give up.
    expect(result.current.error).toBe('Connection lost. Please refresh to reconnect.');
    expect(onError).toHaveBeenCalledWith('Connection lost. Please refresh to reconnect.');

    await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to the next auth candidate when the first returns 401', async () => {
    const stream = createSseStream();
    fetchMock.mockImplementation(async (input: string) => {
      if (new URL(input).searchParams.get('token')) {
        return failedResponse(401);
      }
      return okResponse(stream);
    });

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    act(() => result.current.connect());
    await flush();

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.searchParams.get('token')).toBe('stream-tok');
    expect(secondUrl.searchParams.get('stream_token')).toBe('stream-tok');
  });

  it('reports an auth error without reconnecting when every candidate is unauthorized', async () => {
    fetchMock.mockResolvedValue(failedResponse(401));
    const onError = vi.fn();

    const { result } = renderHook(() => useAgentStream({ ...baseOptions(), onError }));
    act(() => result.current.connect());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2); // token + stream_token candidates
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBe(
      'Stream authentication failed. Check API credentials and token permissions.'
    );
    expect(onError).toHaveBeenCalledWith(
      'Stream authentication failed. Check API credentials and token permissions.'
    );

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2); // auth failures never schedule a reconnect
  });

  it('uses API key candidates when no stream token is available', async () => {
    vi.mocked(agentApi.getStreamToken).mockResolvedValue(null);
    mockAuthState.apiKey = 'api-key-1';
    const stream = createSseStream();
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (new URL(input).searchParams.get('api_key')) {
        return failedResponse(401);
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization === 'ApiKey api-key-1') {
        return okResponse(stream);
      }
      return failedResponse(401);
    });

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    act(() => result.current.connect());
    await flush();

    expect(result.current.isConnected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // api_key query rejected, ApiKey header accepted
  });

  it('surfaces an error when session context is missing', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAgentStream({ ...baseOptions(), sessionId: '', onError })
    );
    act(() => result.current.connect());
    await flush();

    expect(result.current.error).toBe('Missing session context for streaming.');
    expect(onError).toHaveBeenCalledWith('Missing session context for streaming.');
    expect(result.current.isConnecting).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an error when neither a stream token nor an API key is available', async () => {
    vi.mocked(agentApi.getStreamToken).mockResolvedValue(null);

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    act(() => result.current.connect());
    await flush();

    expect(result.current.error).toBe('Secure stream token unavailable.');
    expect(result.current.isConnecting).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a 404 before the first connection as "not ready" and retries', async () => {
    const stream = createSseStream();
    fetchMock.mockResolvedValueOnce(failedResponse(404)).mockResolvedValue(okResponse(stream));

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    act(() => result.current.connect());
    await flush();

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe('Stream not ready. Waiting for agent to start...');

    await advance(20); // first retry fires at base * 2^1 with zero jitter
    await flush();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not retry on network failure when autoReconnect is disabled', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    const { result } = renderHook(() => useAgentStream({ ...baseOptions(), autoReconnect: false }));
    act(() => result.current.connect());
    await flush();

    expect(result.current.error).toBe('Stream connection failed. Please try again later.');
    expect(result.current.isConnecting).toBe(false);
    expect(console.error).toHaveBeenCalled();

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the stream on unmount and performs no further work', async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const { result, stream, unmount } = await renderConnected({ onEvent, onError });

    await pushChunk(
      stream,
      'data: {"type":"message","id":"m1","role":"assistant","content":"Hi"}\n\n'
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(true);

    unmount();
    await vi.advanceTimersByTimeAsync(0);

    expect(stream.cancelled()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no reconnect attempts after unmount
    expect(onEvent).toHaveBeenCalledTimes(1); // no events handled after unmount
    expect(onError).not.toHaveBeenCalled(); // no state/error updates after unmount
  });

  it('disconnect tears down the connection and prevents reconnection', async () => {
    const { result, stream } = await renderConnected();

    act(() => result.current.disconnect());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);

    await flush();
    expect(stream.cancelled()).toBe(true);

    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tears down on offline events and reconnects on online events', async () => {
    const streamA = createSseStream();
    const streamB = createSseStream();
    fetchMock.mockResolvedValueOnce(okResponse(streamA)).mockResolvedValueOnce(okResponse(streamB));

    const { result } = renderHook(() => useAgentStream(baseOptions()));
    act(() => result.current.connect());
    await flush();
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isConnected).toBe(false);
    expect(streamA.cancelled()).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isConnected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
