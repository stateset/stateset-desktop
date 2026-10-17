import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeMcpServer } from './mcp-probe';

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const initializeResult = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: { name: 'stateset-sync', version: '2.1.0' },
  },
};

const toolsResult = {
  jsonrpc: '2.0',
  id: 2,
  result: {
    tools: [{ name: 'list_orders' }, { name: 'get_order' }, { name: 'sync_inventory' }],
  },
};

function mockFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

afterEach(() => {
  // A frozen clock from one test must not leak into the next.
  vi.restoreAllMocks();
});

describe('probeMcpServer', () => {
  it('returns the server identity and tools on a successful handshake', async () => {
    const { fetchImpl, calls } = mockFetch([
      jsonResponse(initializeResult, { 'mcp-session-id': 'sess-1' }),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer(
      { endpoint: 'https://api.sync.stateset.com/v1/tenants/acme/mcp', authToken: 'ss_sync_x' },
      { fetchImpl }
    );

    expect(result).toEqual({
      ok: true,
      serverName: 'stateset-sync',
      serverVersion: '2.1.0',
      protocolVersion: '2025-06-18',
      toolCount: 3,
      tools: ['list_orders', 'get_order', 'sync_inventory'],
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ss_sync_x');
    expect(headers.accept).toBe('application/json, text/event-stream');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ method: 'initialize' });
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({
      method: 'notifications/initialized',
    });
    expect(JSON.parse(calls[2].init.body as string)).toMatchObject({ method: 'tools/list' });
  });

  it('passes the session id from initialize to later requests', async () => {
    const { fetchImpl, calls } = mockFetch([
      jsonResponse(initializeResult, { 'mcp-session-id': 'sess-42' }),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect((calls[1].init.headers as Record<string, string>)['mcp-session-id']).toBe('sess-42');
    expect((calls[2].init.headers as Record<string, string>)['mcp-session-id']).toBe('sess-42');
  });

  it('omits the authorization header when no token is given', async () => {
    const { fetchImpl, calls } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('parses an SSE-framed response', async () => {
    const sse = new Response(`event: message\ndata: ${JSON.stringify(initializeResult)}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    const { fetchImpl } = mockFetch([
      sse,
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toMatchObject({ ok: true, serverName: 'stateset-sync' });
  });

  it('picks the frame matching the request id out of an SSE stream', async () => {
    const noise = { jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } };
    const sse = new Response(
      `event: message\ndata: ${JSON.stringify(noise)}\n\n` +
        `event: message\ndata: ${JSON.stringify(initializeResult)}\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
    const { fetchImpl } = mockFetch([
      sse,
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toMatchObject({ ok: true, serverName: 'stateset-sync', toolCount: 3 });
  });

  it('follows an https redirect and re-validates it', async () => {
    const { fetchImpl, calls } = mockFetch([
      new Response(null, { status: 307, headers: { location: 'https://mcp.example.com/v2/mcp' } }),
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toMatchObject({ ok: true });
    expect(calls[0].url).toBe('https://mcp.example.com/mcp');
    expect(calls[1].url).toBe('https://mcp.example.com/v2/mcp');
    expect(calls[0].init.redirect).toBe('manual');
  });

  it('refuses a redirect to plain http', async () => {
    const { fetchImpl } = mockFetch([
      new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/mcp' } }),
    ]);

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp', authToken: 'secret' },
      { fetchImpl }
    );

    expect(result).toEqual({
      ok: false,
      error: 'The server redirected to an address that is not https.',
      unreachable: true,
    });
  });

  it('stops after too many redirects', async () => {
    const hop = () =>
      new Response(null, { status: 307, headers: { location: 'https://mcp.example.com/next' } });
    const { fetchImpl } = mockFetch([hop(), hop(), hop(), hop()]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'The server redirected too many times.',
      unreachable: true,
    });
  });

  it('reports an HTTP failure with its status', async () => {
    const { fetchImpl } = mockFetch([
      new Response('nope', { status: 401, headers: { 'content-type': 'text/plain' } }),
    ]);

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp', authToken: 'bad' },
      { fetchImpl }
    );

    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized — check the API key.' });
  });

  it('reports a JSON-RPC error from the server', async () => {
    const { fetchImpl } = mockFetch([
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'bad request' } }),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({ ok: false, error: 'bad request' });
  });

  it('rejects a non-https endpoint', async () => {
    const { fetchImpl } = mockFetch([]);

    const result = await probeMcpServer({ endpoint: 'http://evil.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({ ok: false, error: 'MCP endpoint must use https.', unreachable: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows http on localhost only when the host app permits it', async () => {
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    expect(
      await probeMcpServer(
        { endpoint: 'http://localhost:8480/mcp' },
        { fetchImpl, allowLocalhost: true }
      )
    ).toMatchObject({ ok: true });
  });

  it('refuses localhost when the host app does not permit it', async () => {
    const { fetchImpl } = mockFetch([]);

    // A packaged renderer must not reach local services through this channel.
    expect(await probeMcpServer({ endpoint: 'http://localhost:8480/mcp' }, { fetchImpl })).toEqual({
      ok: false,
      error: 'MCP endpoint must use https.',
      unreachable: true,
    });
    expect(await probeMcpServer({ endpoint: 'https://127.0.0.1:8480/mcp' }, { fetchImpl })).toEqual(
      {
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      }
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an unparseable endpoint', async () => {
    const { fetchImpl } = mockFetch([]);

    const result = await probeMcpServer({ endpoint: 'not a url' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoint is not a valid URL.',
      unreachable: true,
    });
  });

  it('rejects a stdio command rather than treating it as a URL', async () => {
    const { fetchImpl } = mockFetch([]);

    const result = await probeMcpServer({ endpoint: 'npx -y stateset-nsr-mcp' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoint is not a valid URL.',
      unreachable: true,
    });
  });

  it('surfaces a network failure as a readable message', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({ ok: false, error: 'Could not reach the server.', unreachable: true });
  });

  it('reports a timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp' },
      { fetchImpl, timeoutMs: 5 }
    );

    expect(result).toEqual({
      ok: false,
      error: 'The server did not respond in time.',
      unreachable: true,
    });
  });

  it('caps how many tool names it returns', async () => {
    const manyTools = {
      jsonrpc: '2.0',
      id: 2,
      result: { tools: Array.from({ length: 80 }, (_, i) => ({ name: `tool_${i}` })) },
    };
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(manyTools),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toMatchObject({ ok: true, toolCount: 80 });
    expect(result.ok && result.tools).toHaveLength(50);
  });

  describe('malformed and unhappy responses', () => {
    it('reports a body that is not JSON', async () => {
      const { fetchImpl } = mockFetch([
        new Response('<html>hello</html>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toEqual({
        ok: false,
        error: 'The server did not return a valid MCP handshake.',
      });
    });

    it('reports an empty body', async () => {
      const { fetchImpl } = mockFetch([
        new Response('', { status: 200, headers: { 'content-type': 'application/json' } }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toMatchObject({ ok: false });
    });

    it('skips an unparseable SSE frame and keeps scanning', async () => {
      const sse = new Response(
        `data: not-json\n\n` + `data: ${JSON.stringify(initializeResult)}\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
      const { fetchImpl } = mockFetch([
        sse,
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toMatchObject({ ok: true, toolCount: 3 });
    });

    it('reports an HTTP failure on tools/list', async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        new Response(null, { status: 500 }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toEqual({
        ok: false,
        status: 500,
        error: 'The server returned an error (HTTP 500).',
      });
    });

    it('reports a JSON-RPC error on tools/list', async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse({ jsonrpc: '2.0', id: 2, error: { message: 'tools unavailable' } }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toEqual({ ok: false, error: 'tools unavailable' });
    });

    it('translates the common HTTP statuses', async () => {
      const cases: [number, string][] = [
        [403, 'Unauthorized — check the API key.'],
        [404, 'No MCP server at that endpoint.'],
        [429, 'The server is rate limiting this client.'],
        [418, 'The server rejected the request (HTTP 418).'],
      ];

      for (const [status, message] of cases) {
        const { fetchImpl } = mockFetch([new Response(null, { status })]);
        const result = await probeMcpServer(
          { endpoint: 'https://mcp.example.com/mcp' },
          { fetchImpl }
        );
        expect(result).toEqual({ ok: false, status, error: message });
      }
    });

    it('treats a redirect with no location as a plain failure', async () => {
      const { fetchImpl } = mockFetch([new Response(null, { status: 302 })]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toMatchObject({ ok: false, status: 302 });
    });

    it('names the server after its host when it identifies itself poorly', async () => {
      const anonymous = { jsonrpc: '2.0', id: 1, result: { capabilities: {} } };
      const { fetchImpl } = mockFetch([
        jsonResponse(anonymous),
        new Response(null, { status: 202 }),
        jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toMatchObject({
        ok: true,
        serverName: 'mcp.example.com',
        serverVersion: 'unknown',
        protocolVersion: '2025-06-18',
        toolCount: 0,
      });
    });

    it('ignores tools that have no usable name', async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'good' }, { name: 42 }, {}, 'nope'] },
        }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result).toMatchObject({ ok: true, toolCount: 1, tools: ['good'] });
    });

    it('trims the token before sending it', async () => {
      const { fetchImpl, calls } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp', authToken: '  sk_padded  ' },
        { fetchImpl }
      );

      expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
        'Bearer sk_padded'
      );
    });
  });

  it('rejects a URL that parses but is not http(s)', async () => {
    const { fetchImpl } = mockFetch([]);

    const result = await probeMcpServer({ endpoint: 'ftp://files.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoint is not a valid URL.',
      unreachable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an SSE stream that never answers the request', async () => {
    const other = { jsonrpc: '2.0', id: 99, result: {} };
    const sse = new Response(`data: ${JSON.stringify(other)}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    const { fetchImpl } = mockFetch([sse]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'The server did not return a valid MCP handshake.',
    });
  });

  it('refuses a redirect to another host rather than following it with the token', async () => {
    const { fetchImpl, calls } = mockFetch([
      new Response(null, { status: 307, headers: { location: 'https://elsewhere.example/mcp' } }),
    ]);

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp', authToken: 'sk_secret' },
      { fetchImpl }
    );

    expect(result).toEqual({
      ok: false,
      error: 'The server redirected to a different host. Point at that address instead.',
      unreachable: true,
    });
    // The token went to the configured host only, and nowhere else.
    expect(calls).toHaveLength(1);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk_secret'
    );
  });

  it('keeps the token across a redirect that stays on the same origin', async () => {
    const { fetchImpl, calls } = mockFetch([
      new Response(null, { status: 307, headers: { location: 'https://mcp.example.com/v2/mcp' } }),
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp', authToken: 'sk_secret' },
      { fetchImpl }
    );

    expect((calls[1].init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk_secret'
    );
  });

  it('times out a body that never finishes streaming', async () => {
    const stalled = {
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      // A stream the server never closes.
      text: () =>
        new Promise<string>((_, reject) =>
          setTimeout(() => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, 5)
        ),
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => stalled) as unknown as typeof fetch;

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp' },
      { fetchImpl, timeoutMs: 5 }
    );

    expect(result).toEqual({
      ok: false,
      error: 'The server did not respond in time.',
      unreachable: true,
    });
  });

  it('refuses to call an unreadable tool list a success', async () => {
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      new Response('<html>gateway error</html>', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    // "0 tools" would be recorded as a verified server.
    expect(result).toEqual({ ok: false, error: 'The server did not return a valid tool list.' });
  });

  it('applies one deadline across the whole handshake', async () => {
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    // The first request eats the entire budget.
    const probing = probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp' },
      { fetchImpl, timeoutMs: 10 }
    );
    now += 50;
    const result = await probing;

    // Exhausting the deadline means the server was never heard from, so this
    // must not read as the server disproving a stored verification.
    expect(result).toEqual({
      ok: false,
      error: 'The server did not respond in time.',
      unreachable: true,
    });
    nowSpy.mockRestore();
  });

  it('joins a payload split across several data lines', async () => {
    const pretty = JSON.stringify(initializeResult, null, 2)
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n');
    const sse = new Response(`event: message\n${pretty}\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    const { fetchImpl } = mockFetch([
      sse,
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

    expect(result).toMatchObject({ ok: true, serverName: 'stateset-sync' });
  });

  it('refuses private and internal addresses', async () => {
    const refused = [
      'https://10.0.0.5/mcp',
      'https://192.168.1.10/mcp',
      'https://172.16.4.4/mcp',
      'https://169.254.169.254/mcp',
      'https://[fd00::1]/mcp',
      'https://printer.local/mcp',
      'https://vault.internal/mcp',
    ];

    for (const endpoint of refused) {
      const { fetchImpl } = mockFetch([]);
      const result = await probeMcpServer({ endpoint }, { fetchImpl });

      expect(result).toEqual({
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('still allows the documented local development endpoints', async () => {
    for (const endpoint of ['http://localhost:8480/mcp', 'http://127.0.0.1:8480/mcp']) {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      expect(await probeMcpServer({ endpoint }, { fetchImpl, allowLocalhost: true })).toMatchObject(
        { ok: true }
      );
    }
  });

  it('refuses an IPv4-mapped IPv6 address for a private host', async () => {
    for (const endpoint of [
      'https://[::ffff:169.254.169.254]/mcp',
      'https://[::ffff:10.0.0.1]/mcp',
      'https://[::ffff:a00:1]/mcp',
    ]) {
      const { fetchImpl } = mockFetch([]);

      const result = await probeMcpServer({ endpoint }, { fetchImpl });

      expect(result).toEqual({
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('still allows a mapped public address', async () => {
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);

    const result = await probeMcpServer(
      { endpoint: 'https://[::ffff:93.184.216.34]/mcp' },
      { fetchImpl }
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses an IPv4-compatible IPv6 address for a private host', async () => {
    const { fetchImpl } = mockFetch([]);

    // The URL parser hands this over as [::a00:1].
    const result = await probeMcpServer({ endpoint: 'https://[::10.0.0.1]/mcp' }, { fetchImpl });

    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoints on private or internal addresses are not supported.',
      unreachable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a hostname that resolves into a private range', async () => {
    const { fetchImpl } = mockFetch([]);
    const resolveHost = vi.fn().mockResolvedValue(['169.254.169.254']);

    const result = await probeMcpServer(
      { endpoint: 'https://metadata.example.com/mcp' },
      { fetchImpl, resolveHost }
    );

    expect(resolveHost).toHaveBeenCalledWith('metadata.example.com');
    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoints on private or internal addresses are not supported.',
      unreachable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows a hostname that resolves publicly', async () => {
    const { fetchImpl } = mockFetch([
      jsonResponse(initializeResult),
      new Response(null, { status: 202 }),
      jsonResponse(toolsResult),
    ]);
    const resolveHost = vi.fn().mockResolvedValue(['93.184.216.34', '2606:2800:220:1::1']);

    const result = await probeMcpServer(
      { endpoint: 'https://mcp.example.com/mcp' },
      { fetchImpl, resolveHost }
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses when any resolved address is private', async () => {
    const { fetchImpl } = mockFetch([]);
    const resolveHost = vi.fn().mockResolvedValue(['93.184.216.34', '10.1.2.3']);

    const result = await probeMcpServer(
      { endpoint: 'https://mixed.example.com/mcp' },
      { fetchImpl, resolveHost }
    );

    expect(result).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to probe when the address cannot be resolved', async () => {
    const { fetchImpl } = mockFetch([]);
    const resolveHost = vi.fn().mockRejectedValue(new Error('SERVFAIL'));

    // Fails closed: an address we cannot vouch for is not probed.
    expect(
      await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl, resolveHost })
    ).toEqual({
      ok: false,
      error: 'Could not resolve the address of that server.',
      unreachable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a name that resolves to loopback', async () => {
    const { fetchImpl } = mockFetch([]);

    // localtest.me, 127.0.0.1.nip.io and friends all resolve to loopback.
    for (const addresses of [['127.0.0.1'], ['::1'], ['::1', '127.0.0.1']]) {
      const resolveHost = vi.fn().mockResolvedValue(addresses);
      expect(
        await probeMcpServer(
          { endpoint: 'https://localtest.me/mcp' },
          { fetchImpl, resolveHost, allowLocalhost: true }
        )
      ).toEqual({
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses carrier-grade NAT, benchmarking and multicast ranges', async () => {
    for (const endpoint of [
      'https://100.64.1.5/mcp', // CGNAT, e.g. a Tailscale peer
      'https://100.100.100.200/mcp', // cloud metadata on that range
      'https://198.18.0.1/mcp',
      'https://224.0.0.1/mcp',
      'https://192.0.0.1/mcp',
      'https://[fec0::1]/mcp',
      'https://[ff02::1]/mcp',
    ]) {
      const { fetchImpl } = mockFetch([]);
      expect(await probeMcpServer({ endpoint }, { fetchImpl })).toEqual({
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses an internal name written as a fully-qualified domain', async () => {
    for (const endpoint of [
      'https://wiki.internal./mcp',
      'https://printer.local./mcp',
      'https://metadata.google.internal./mcp',
    ]) {
      const { fetchImpl } = mockFetch([]);
      expect(await probeMcpServer({ endpoint }, { fetchImpl })).toEqual({
        ok: false,
        error: 'MCP endpoints on private or internal addresses are not supported.',
        unreachable: true,
      });
    }
  });

  it('rejects an endpoint carrying credentials', async () => {
    const { fetchImpl } = mockFetch([]);

    const result = await probeMcpServer(
      { endpoint: 'https://user:pass@mcp.example.com/mcp' },
      { fetchImpl }
    );

    expect(result).toEqual({
      ok: false,
      error: 'MCP endpoint must not contain credentials.',
      unreachable: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('replies that only look valid', () => {
    it('refuses a handshake whose result is not an object', async () => {
      for (const result of ['pwned', 42, true, []]) {
        const { fetchImpl } = mockFetch([jsonResponse({ jsonrpc: '2.0', id: 1, result })]);

        expect(
          await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
        ).toEqual({ ok: false, error: 'The server did not return a valid MCP handshake.' });
      }
    });

    it('refuses a tool list whose result is not an object', async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse({ jsonrpc: '2.0', id: 2, result: 'also' }),
      ]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toEqual({ ok: false, error: 'The server did not return a valid tool list.' });
    });

    it("does not accept a reply carrying someone else's id", async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse({ jsonrpc: '2.0', id: 5, result: { serverInfo: { name: 'x' } } }),
      ]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toEqual({ ok: false, error: 'The server did not return a valid MCP handshake.' });
    });

    it('reports a failed notifications/initialized instead of ignoring it', async () => {
      const { fetchImpl } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 401 }),
      ]);

      // Two thirds of a handshake is not a working server.
      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toEqual({ ok: false, status: 401, error: 'Unauthorized — check the API key.' });
    });

    it('accepts a string JSON-RPC id in an SSE stream', async () => {
      const stringId = { ...initializeResult, id: '1' };
      const sse = new Response(`data: ${JSON.stringify(stringId)}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
      const { fetchImpl } = mockFetch([
        sse,
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toMatchObject({ ok: true });
    });

    it('skips a server-initiated request that shares the reply id', async () => {
      const serverRequest = { jsonrpc: '2.0', id: 1, method: 'roots/list' };
      const sse = new Response(
        `data: ${JSON.stringify(serverRequest)}\n\n` +
          `data: ${JSON.stringify(initializeResult)}\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
      const { fetchImpl } = mockFetch([
        sse,
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toMatchObject({ ok: true, serverName: 'stateset-sync' });
    });

    it('reads an SSE content type regardless of its casing', async () => {
      const sse = new Response(`data: ${JSON.stringify(initializeResult)}\n\n`, {
        status: 200,
        headers: { 'content-type': 'Text/Event-Stream' },
      });
      const { fetchImpl } = mockFetch([
        sse,
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toMatchObject({ ok: true });
    });

    it('type-checks and caps the strings a server reports', async () => {
      const hostile = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'x'.repeat(5000), version: { evil: 1 } },
        },
      };
      const { fetchImpl } = mockFetch([
        jsonResponse(hostile),
        new Response(null, { status: 202 }),
        jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'y'.repeat(5000) }] } }),
      ]);

      const result = await probeMcpServer(
        { endpoint: 'https://mcp.example.com/mcp' },
        { fetchImpl }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.serverName).toHaveLength(200);
      // A non-string version must not reach the renderer as one.
      expect(result.serverVersion).toBe('unknown');
      expect(result.tools[0]).toHaveLength(200);
    });
  });

  describe('bounds', () => {
    it('refuses a body larger than a handshake should be', async () => {
      const huge = new Response('x'.repeat(2 * 1024 * 1024), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      const { fetchImpl } = mockFetch([huge]);

      expect(
        await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl })
      ).toEqual({
        ok: false,
        error: 'The server sent more data than a handshake should.',
        unreachable: true,
      });
    });

    it('spends one redirect budget across the whole handshake', async () => {
      const hop = () =>
        new Response(null, { status: 307, headers: { location: 'https://mcp.example.com/next' } });
      const { fetchImpl, calls } = mockFetch([
        hop(),
        hop(),
        hop(),
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

      // Three hops, then the handshake — never three hops per message.
      expect(calls.length).toBeLessThanOrEqual(6);
    });

    it('passes an abort signal with every request', async () => {
      const { fetchImpl, calls } = mockFetch([
        jsonResponse(initializeResult),
        new Response(null, { status: 202 }),
        jsonResponse(toolsResult),
      ]);

      await probeMcpServer({ endpoint: 'https://mcp.example.com/mcp' }, { fetchImpl });

      // Without this the documented timeout guarantee silently disappears.
      for (const call of calls) {
        expect(call.init.signal).toBeInstanceOf(AbortSignal);
      }
    });
  });
});
