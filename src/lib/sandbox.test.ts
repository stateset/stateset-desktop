/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clearSandboxApiKey = vi.fn();
const authState = {
  sandboxApiKey: 'sandbox-key',
  clearSandboxApiKey,
};

vi.mock('../stores/auth', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sandboxApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.sandboxApiKey = 'sandbox-key';
  });

  it('health check omits auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', database: 'connected' }));
    const { sandboxApi } = await import('./sandbox');

    const result = await sandboxApi.health();

    expect(result.status).toBe('ok');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it('create sends POST with JSON content-type and auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        sandbox_id: 's1',
        org_id: 'o1',
        session_id: 'sess1',
        status: 'running',
        pod_ip: '127.0.0.1',
        created_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-01T01:00:00Z',
      })
    );
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.create();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/create'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'ApiKey sandbox-key',
        }),
      })
    );
  });

  it('tries multiple auth header candidates on unauthorized responses', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        jsonResponse({
          sandbox_id: 's1',
          org_id: 'o1',
          session_id: 'sess1',
          status: 'running',
          pod_ip: '127.0.0.1',
          created_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-01-01T01:00:00Z',
        })
      );
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.get('sandbox-1');

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1]?.headers).toMatchObject({ Authorization: 'ApiKey sandbox-key' });
    expect(calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer sandbox-key' });
    expect(calls[2][1]?.headers).toMatchObject({ 'X-API-Key': 'sandbox-key' });
    expect(clearSandboxApiKey).not.toHaveBeenCalled();
  });

  it('clears stored sandbox key after final unauthorized response', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('still forbidden', { status: 403 }));
    const { sandboxApi } = await import('./sandbox');

    await expect(sandboxApi.get('sandbox-1')).rejects.toThrow();
    expect(clearSandboxApiKey).toHaveBeenCalledTimes(1);
  });

  it('retries safe GET requests on retryable status', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('server down', { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          sandbox_id: 's2',
          org_id: 'o1',
          session_id: 'sess2',
          status: 'running',
          pod_ip: '127.0.0.2',
          created_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-01-01T01:00:00Z',
        })
      );
    const { sandboxApi } = await import('./sandbox');

    const result = await sandboxApi.get('sandbox-2');
    expect(result.sandbox_id).toBe('s2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-safe POST requests by default', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('server down', { status: 503 }));
    const { sandboxApi } = await import('./sandbox');

    await expect(sandboxApi.create()).rejects.toThrow('server down');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('encodes file paths when reading files', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ content: 'hello' }));
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.readFile('sandbox-1', '/tmp/a file.txt');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-1/files?path=%2Ftmp%2Fa%20file.txt'),
      expect.any(Object)
    );
  });

  it('calls status endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'running' }));
    const { sandboxApi } = await import('./sandbox');

    const result = await sandboxApi.status('sandbox-2');
    expect(result).toEqual({ status: 'running' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-2/status'),
      expect.any(Object)
    );
  });

  it('calls terminate endpoint with DELETE', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.terminate('sandbox-3');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-3'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('calls stop endpoint with POST', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.stop('sandbox-4');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-4/stop'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('executes command with JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ output: 'ok', exitCode: 0 }));
    const { sandboxApi } = await import('./sandbox');

    const result = await sandboxApi.execute('sandbox-5', 'ls -la');
    expect(result).toEqual({ output: 'ok', exitCode: 0 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-5/execute'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'ls -la' }),
      })
    );
  });

  it('writes files with JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const { sandboxApi } = await import('./sandbox');

    await sandboxApi.writeFile('sandbox-6', '/tmp/test.txt', 'hello');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sandbox/sandbox-6/files'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: '/tmp/test.txt', content: 'hello' }),
      })
    );
  });

  it('retries on network TypeError for safe requests', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        jsonResponse({
          sandbox_id: 's7',
          org_id: 'o1',
          session_id: 'sess7',
          status: 'running',
          pod_ip: '127.0.0.7',
          created_at: '2026-01-01T00:00:00Z',
          expires_at: '2026-01-01T01:00:00Z',
        })
      );
    const { sandboxApi } = await import('./sandbox');

    const result = await sandboxApi.get('sandbox-7');
    expect(result.sandbox_id).toBe('s7');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('exposes stable query keys', async () => {
    const { sandboxQueryKeys } = await import('./sandbox');
    expect(sandboxQueryKeys.all).toEqual(['sandbox']);
    expect(sandboxQueryKeys.health()).toEqual(['sandbox', 'health']);
    expect(sandboxQueryKeys.list()).toEqual(['sandbox', 'list']);
    expect(sandboxQueryKeys.detail('id-1')).toEqual(['sandbox', 'detail', 'id-1']);
  });
});
