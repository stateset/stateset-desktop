import { describe, expect, it, vi } from 'vitest';
import {
  requestDurableWorkflow,
  streamDurableWorkflowEvents,
  validateDurableWorkflowRequest,
  validateDurableWorkflowStreamRequest,
  type DurableWorkflowEvent,
} from './durable-workflow-bridge';

const configuration = {
  url: 'https://custom.engine.example/base',
  apiKey: 'native-key',
  revision: 'revision-one',
};
const identity = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-one',
  engineUrl: configuration.url,
  revision: configuration.revision,
};
const request = { ...identity, method: 'GET' as const, path: '/health' };
const streamRequest = { ...identity, workflowId: 'legacy workflow:one' };
const event = (id = 1, preview = 'Evidence ready'): DurableWorkflowEvent => ({
  event_id: id,
  kind: 'activity_completed',
  ts: '2026-10-17T12:00:00Z',
  preview,
});
const encoder = new TextEncoder();
const frame = (value = event()) => `data: ${JSON.stringify(value)}\n\n`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function responseStream(
  parts: Array<string | Uint8Array>,
  close = true,
  contentType = 'text/event-stream'
) {
  const cancel = vi.fn();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      parts.forEach((part) =>
        value.enqueue(typeof part === 'string' ? encoder.encode(part) : part)
      );
      if (close) value.close();
    },
    cancel,
  });
  return {
    response: new Response(body, { headers: { 'content-type': contentType } }),
    cancel,
    controller,
    body,
  };
}

describe('durable workflow request admission', () => {
  it.each([
    ['GET', '/health'],
    ['GET', '/v1/workflows/active-horizon-agent/legacy%20workflow%3Aone/status'],
    ['POST', '/v1/workflows/active-horizon-agent/start'],
    ['POST', '/v1/workflows/connector/start'],
    ['GET', '/v1/workflows/connector/legacy%20workflow%3Aone/status'],
    ['POST', '/v1/workflows/connector/legacy%20workflow%3Aone/cancel'],
    ...[
      'pause',
      'resume',
      'cancel',
      'terminate',
      'steer',
      'reprioritize',
      'extend-budget',
      'enqueue',
    ].map((action) => ['POST', `/v1/workflows/active-horizon-agent/legacy-one/${action}`]),
  ])('admits only the supported %s %s operation', (method, path) => {
    expect(validateDurableWorkflowRequest({ ...identity, method, path })).toMatchObject({
      method,
      path,
    });
  });

  it.each([
    ['POST', '/health'],
    ['GET', '/v1/workflows/active-horizon-agent/start'],
    ['POST', '/v1/workflows/active-horizon-agent/wf/status'],
    ['GET', '/v1/workflows/active-horizon-agent/wf/pause'],
    ['PUT', '/v1/workflows/active-horizon-agent/wf/steer'],
    ['GET', 'https://other.example/health'],
    ['GET', '//other.example/health'],
    ['GET', '/health?secret=one'],
    ['GET', '/health#fragment'],
    ['GET', '/v1/workflows/active-horizon-agent/../status'],
    ['GET', '/v1/workflows/active-horizon-agent/%2e%2e/status'],
    ['GET', '/v1/workflows/active-horizon-agent/a%2Fb/status'],
    ['GET', '/v1/workflows/active-horizon-agent/a%5Cb/status'],
    ['GET', '/v1/workflows/active-horizon-agent/%252f/status'],
    ['GET', '/v1/workflows/active-horizon-agent/wf%0A/status'],
    ['GET', '/v1/workflows/active-horizon-agent/wf/status/extra'],
    ['GET', '/v1/workflows/connector/start'],
    ['POST', '/v1/workflows/connector/wf/status'],
    ['GET', '/v1/workflows/connector/wf/cancel'],
    ['POST', '/v1/workflows/connector/wf/pause'],
    ['POST', '/v1/workflows/connector/wf/enqueue'],
    ['GET', '/v1/workflows/connector/%2e%2e/status'],
    ['GET', '/v1/workflows/connector/a%2fb/status'],
    ['GET', '/v1/workflows/connector/%252f/status'],
    ['GET', '/v1/workflows/connector/wf/status?token=secret'],
    ['POST', '/v1/workflows/connector/wf/cancel/extra'],
  ])('refuses %s %s before a fetch', async (method, path) => {
    const fetcher = vi.fn();
    await expect(
      requestDurableWorkflow({ ...identity, method, path }, configuration, fetcher)
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'not-a-uuid' },
    { id: '00000000-0000-0000-0000-000000000000' },
    { tenantId: '' },
    { tenantId: 'tenant\r\ninjected: yes' },
    { tenantId: 'a'.repeat(101) },
    { revision: '' },
    { engineUrl: 'https://user:password@engine.example' },
    { engineUrl: 'http://remote.example' },
    { engineUrl: 'https://engine.example?query=one' },
  ])('rejects unsafe connection metadata %j', (overrides) => {
    expect(() => validateDurableWorkflowRequest({ ...request, ...overrides })).toThrow();
  });

  it('bounds JSON bytes and snapshots a submitted body', () => {
    const body = { goal: 'original' };
    const admitted = validateDurableWorkflowRequest({
      ...request,
      method: 'POST',
      path: '/v1/workflows/active-horizon-agent/start',
      body,
    });
    body.goal = 'mutated';
    expect(admitted.body).toEqual({ goal: 'original' });
    const large = 'a'.repeat(2 * 1024 * 1024 - 2);
    expect(() => validateDurableWorkflowRequest({ ...admitted, body: large })).not.toThrow();
    expect(() => validateDurableWorkflowRequest({ ...admitted, body: `${large}界` })).toThrow(
      '2 MiB'
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => validateDurableWorkflowRequest({ ...admitted, body: cyclic })).toThrow('JSON');
    expect(() => validateDurableWorkflowRequest({ ...request, body: {} })).toThrow('allowed API');
  });

  it('preserves safe legacy stream IDs and validates reconnect IDs', () => {
    expect(
      validateDurableWorkflowStreamRequest({ ...streamRequest, lastEventId: 42 })
    ).toMatchObject({ workflowId: 'legacy workflow:one', lastEventId: 42 });
    for (const workflowId of [
      '..',
      'bad/id',
      'bad\\id',
      '%2e%2e',
      'bad\n',
      'https://other.example',
    ])
      expect(() =>
        validateDurableWorkflowStreamRequest({ ...streamRequest, workflowId })
      ).toThrow();
    for (const lastEventId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => validateDurableWorkflowStreamRequest({ ...streamRequest, lastEventId })).toThrow(
        'event ID'
      );
  });
});

describe('native durable workflow HTTP transport', () => {
  it('uses the saved custom origin and native key, retries only authentication and returns HTTP errors', async () => {
    const abandoned = responseStream(['unauthorized'], false, 'application/json');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(abandoned.body, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Not ready.' }), { status: 404 })
      );
    expect(await requestDurableWorkflow(request, configuration, fetcher)).toEqual({
      ok: false,
      status: 404,
      body: { message: 'Not ready.' },
    });
    expect(abandoned.cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toEqual([
      `${configuration.url}/health`,
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer native-key',
          'x-tenant-id': 'tenant-one',
        }),
      }),
    ]);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('ApiKey native-key');
  });

  it('returns the final authentication response and preserves bounded plain-text errors', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response('Access denied.', { status: 401 }));
    expect(await requestDurableWorkflow(request, configuration, fetcher)).toEqual({
      ok: false,
      status: 401,
      body: 'Access denied.',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([200, 503])(
    'preserves the complete non-JSON HTTP %s response as plain text',
    async (status) => {
      const body = `Workflow engine response: ${'Evidence ready. ✓ '.repeat(150)}`;
      const fetcher = vi.fn().mockResolvedValue(new Response(body, { status }));
      expect(await requestDurableWorkflow(request, configuration, fetcher)).toEqual({
        ok: status === 200,
        status,
        body,
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );

  it.each([{ engineUrl: 'https://different.example' }, { revision: 'stale' }])(
    'rejects stale request metadata %j without sending credentials',
    async (overrides) => {
      const fetcher = vi.fn();
      await expect(
        requestDurableWorkflow({ ...request, ...overrides }, configuration, fetcher)
      ).rejects.toThrow('connection changed');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('cleans an abandoned response and never retries old authentication after a connection change', async () => {
    let current = true;
    const body = responseStream(['wait'], false);
    const fetcher = vi.fn().mockImplementation(async () => {
      current = false;
      return new Response(body.body, { status: 401 });
    });
    await expect(
      requestDurableWorkflow(request, configuration, fetcher, () => current)
    ).rejects.toThrow('connection changed');
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects a context change during response reads and releases the reader', async () => {
    let current = true;
    const body = responseStream([], false);
    const reading = requestDurableWorkflow(
      request,
      configuration,
      vi.fn().mockResolvedValue(body.response),
      () => current
    );
    await vi.waitFor(() => expect(body.body.locked).toBe(true));
    current = false;
    body.controller.enqueue(encoder.encode('{}'));
    await expect(reading).rejects.toThrow('connection changed');
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(body.body.locked).toBe(false);
  });

  it('cancels an idle body promptly on caller abort', async () => {
    const controller = new AbortController();
    const body = responseStream([], false);
    const reading = requestDurableWorkflow(
      request,
      configuration,
      vi.fn().mockResolvedValue(body.response),
      () => true,
      controller.signal
    );
    await vi.waitFor(() => expect(body.body.locked).toBe(true));
    controller.abort(new Error('Caller cancelled.'));
    await expect(reading).rejects.toThrow('Caller cancelled.');
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(body.body.locked).toBe(false);
  });

  it('cancels a late response when the caller aborted before fetch completed', async () => {
    const pending = deferred<Response>();
    const controller = new AbortController();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    const reading = requestDurableWorkflow(
      request,
      configuration,
      fetcher,
      () => true,
      controller.signal
    );
    controller.abort(new Error('Cancelled before headers.'));
    await expect(reading).rejects.toThrow('Cancelled before headers.');
    const late = responseStream([], false);
    pending.resolve(late.response);
    await vi.waitFor(() => expect(late.cancel).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('bounds response bytes and cleans up on overflow', async () => {
    const body = responseStream([new Uint8Array(2 * 1024 * 1024 + 1)], false);
    await expect(
      requestDurableWorkflow(request, configuration, vi.fn().mockResolvedValue(body.response))
    ).rejects.toThrow('response exceeds');
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(body.body.locked).toBe(false);
  });
});

describe('native durable workflow event transport', () => {
  it('accepts an initial event ID of zero without adding a resume header', async () => {
    const body = responseStream([frame()]);
    const fetcher = vi.fn().mockResolvedValue(body.response);
    await streamDurableWorkflowEvents(
      { ...streamRequest, lastEventId: 0 },
      configuration,
      vi.fn(),
      fetcher
    );
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Last-Event-ID');
  });

  it('preserves fragmented UTF8, CRLF, multiline JSON and reconnect metadata', async () => {
    const expected = event(8, '界🙂');
    const encoded = encoder.encode(
      `: heartbeat\r\n\r\nevent: activity\r\nid: 8\r\ndata: {"event_id":8,\r\ndata: "kind":"activity_completed","ts":"2026-10-17T12:00:00Z","preview":"界🙂"}\r\n\r\n`
    );
    const body = responseStream(Array.from(encoded, (byte) => new Uint8Array([byte])));
    const fetcher = vi.fn().mockResolvedValue(body.response);
    const events: DurableWorkflowEvent[] = [];
    await streamDurableWorkflowEvents(
      { ...streamRequest, lastEventId: 7 },
      configuration,
      (value) => events.push(value),
      fetcher
    );
    expect(events).toEqual([expected]);
    expect(fetcher.mock.calls[0]).toEqual([
      `${configuration.url}/v1/workflows/legacy%20workflow%3Aone/events`,
      expect.objectContaining({
        redirect: 'error',
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer native-key',
          'x-tenant-id': 'tenant-one',
          'Last-Event-ID': '7',
        },
      }),
    ]);
    expect(body.body.locked).toBe(false);
  });

  it('keeps comments, empty data and malformed non-error events benign, then emits valid final data', async () => {
    const body = responseStream([
      ': ping\n\ndata:\n\ndata: {bad\n\ndata: {"kind":"missing-fields"}\n\n',
      frame(event(2)).trimEnd(),
    ]);
    const onEvent = vi.fn();
    await streamDurableWorkflowEvents(
      streamRequest,
      configuration,
      onEvent,
      vi.fn().mockResolvedValue(body.response)
    );
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event(2));
    expect(body.body.locked).toBe(false);
  });

  it('cleans the first authentication response before reconnecting with ApiKey', async () => {
    const first = responseStream([], false);
    const next = responseStream([frame()]);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(first.body, { status: 401 }))
      .mockResolvedValueOnce(next.response);
    const onEvent = vi.fn();
    await streamDurableWorkflowEvents(streamRequest, configuration, onEvent, fetcher);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('ApiKey native-key');
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it.each(['abort', 'callback', 'connection'] as const)(
    'cleans up the live reader after %s',
    async (failure) => {
      const controller = new AbortController();
      let current = true;
      const body = responseStream([], false);
      const onEvent = vi.fn(() => {
        if (failure === 'callback') throw new Error('Consumer failed.');
      });
      const streaming = streamDurableWorkflowEvents(
        streamRequest,
        configuration,
        onEvent,
        vi.fn().mockResolvedValue(body.response),
        () => current,
        controller.signal
      );
      await vi.waitFor(() => expect(body.body.locked).toBe(true));
      if (failure === 'abort') controller.abort(new Error('Cancelled.'));
      else {
        if (failure === 'connection') current = false;
        body.controller.enqueue(encoder.encode(frame()));
      }
      await expect(streaming).rejects.toThrow(
        failure === 'abort'
          ? 'Cancelled.'
          : failure === 'callback'
            ? 'Consumer failed.'
            : 'connection changed'
      );
      expect(body.cancel).toHaveBeenCalledOnce();
      expect(body.body.locked).toBe(false);
      if (failure === 'connection') expect(onEvent).not.toHaveBeenCalled();
    }
  );

  it('does not impose an HTTP lifetime timeout on a healthy event stream', async () => {
    const body = responseStream([frame()], false);
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(body.response);
    const onEvent = vi.fn();
    const streaming = streamDurableWorkflowEvents(
      streamRequest,
      configuration,
      onEvent,
      fetcher,
      () => true,
      controller.signal
    );
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledOnce());
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
    controller.abort();
    await expect(streaming).rejects.toBeDefined();
  });

  it.each([
    'data: {"kind":"stream_error","error":"History unavailable."}\n\n',
    `data: ${'a'.repeat(256 * 1024)}\n\n`,
  ])('rejects error/oversized frames and cancels the reader', async (data) => {
    const body = responseStream([data], false);
    await expect(
      streamDurableWorkflowEvents(
        streamRequest,
        configuration,
        vi.fn(),
        vi.fn().mockResolvedValue(body.response)
      )
    ).rejects.toThrow(data.includes('stream_error') ? 'History unavailable.' : 'frame exceeds');
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(body.body.locked).toBe(false);
  });

  it('refuses a successful JSON response pretending to be a stream', async () => {
    const body = responseStream(['{}'], false, 'application/json');
    await expect(
      streamDurableWorkflowEvents(
        streamRequest,
        configuration,
        vi.fn(),
        vi.fn().mockResolvedValue(body.response)
      )
    ).rejects.toThrow('did not return an event stream');
    expect(body.cancel).toHaveBeenCalledOnce();
  });

  it('reports bounded HTTP stream errors and rejects malformed UTF8 with cleanup', async () => {
    await expect(
      streamDurableWorkflowEvents(
        streamRequest,
        configuration,
        vi.fn(),
        vi.fn().mockResolvedValue(new Response('Unavailable.', { status: 503 }))
      )
    ).rejects.toMatchObject({ message: 'Unavailable.', status: 503 });
    const body = responseStream([new Uint8Array([0xff])], false);
    await expect(
      streamDurableWorkflowEvents(
        streamRequest,
        configuration,
        vi.fn(),
        vi.fn().mockResolvedValue(body.response)
      )
    ).rejects.toThrow();
    expect(body.cancel).toHaveBeenCalledOnce();
  });
});
