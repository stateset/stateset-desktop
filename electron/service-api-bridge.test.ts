import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  registerDesktopServiceIpc,
  requestDesktopService,
  validateDesktopServiceRequest,
  type DesktopServiceRequest,
} from './service-api-bridge';
const baseUrl = 'https://api.sandbox.example';
const configuration = { baseUrl, apiKey: 'saved-key' };
const id = (n = 1) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const request = (patch: Partial<DesktopServiceRequest> = {}): DesktopServiceRequest => ({
  id: id(),
  service: 'sandbox',
  baseUrl,
  path: '/api/v1/agent/sessions',
  method: 'POST',
  headers: { Authorization: 'ApiKey saved-key', 'Content-Type': 'application/json' },
  body: '{}',
  timeoutMs: 1000,
  ...patch,
});
const signal = () => new AbortController().signal;
describe('native desktop service boundary', () => {
  it('sends the saved connection only to its fixed API with redirects forbidden', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"id":"session"}', { status: 201 }));
    await expect(
      requestDesktopService(request(), configuration, signal(), fetcher)
    ).resolves.toEqual({ status: 201, bodyText: '{"id":"session"}' });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/agent/sessions`,
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: { authorization: 'ApiKey saved-key', 'content-type': 'application/json' },
        redirect: 'error',
      })
    );
  });
  it.each([
    { Authorization: 'ApiKey saved-key' },
    { Authorization: 'Bearer saved-key' },
    { 'X-API-Key': 'saved-key' },
  ])('preserves supported Sandbox authentication modes (%j)', async (headers) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await requestDesktopService(request({ headers }), configuration, signal(), fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.credentials).toBe('omit');
  });
  it.each([
    { baseUrl: 'https://other.example' },
    { headers: { Authorization: 'ApiKey stale-key' } },
    { headers: { Authorization: 'ApiKey saved-key', 'X-API-Key': 'saved-key' } },
    { headers: { Authorization: 'ApiKey saved-key', Cookie: 'borrowed' } },
    { headers: { Authorization: 'ApiKey saved-key', authorization: 'Bearer saved-key' } },
    { headers: { Authorization: 'ApiKey saved-key', 'X-Test': 'secret' } },
    { headers: { Authorization: 'ApiKey saved-key\r\nInjected: value' } },
    { path: '//other.example/api/v1/agent/sessions' },
    { path: '/api/v1/agent/sessions/../secrets' },
    { path: '/api/v1/agent/sessions?redirect=https://other.example' },
    { path: '/api/v1/agent/sessions/a/start', method: 'DELETE' as const },
    { method: 'GET' as const },
    { body: 'not-json' },
    { body: '"' + 'x'.repeat(2 * 1024 * 1024) + '"' },
    { timeoutMs: 0 },
    { timeoutMs: 420001 },
    { scope: null as never },
  ])('rejects unsafe requests before network I/O (%j)', async (patch) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      requestDesktopService(request(patch), configuration, signal(), fetcher)
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['/workspace/a.txt', '/workspace/sub/file.json'])(
    'allows bounded legacy workspace reads (%s)',
    (path) => {
      expect(
        validateDesktopServiceRequest(
          request({
            path: `/api/sandbox/owned/files?path=${encodeURIComponent(path)}`,
            method: 'GET',
            body: undefined,
          })
        ).path
      ).toContain('/files?path=');
    }
  );
  it.each(['/etc/passwd', '/workspace/../private', '/workspace/a\\b', '/workspace/a\n'])(
    'rejects escaped legacy workspace paths (%s)',
    (path) => {
      expect(() =>
        validateDesktopServiceRequest(
          request({
            path: `/api/sandbox/owned/files?path=${encodeURIComponent(path)}`,
            method: 'GET',
            body: undefined,
          })
        )
      ).toThrow();
    }
  );
  it('permits NSR Decisions and proof verification with the saved scoped key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    const r = request({
      service: 'nsr',
      baseUrl: 'https://api.nsr.example',
      path: '/v1/decisions',
      headers: {
        'X-API-Key': 'policy-key',
        'X-Org-ID': 'actual-session-org',
        'Content-Type': 'application/json',
      },
      scope: { tenantId: 'tenant', brandId: 'brand' },
    });
    for (const path of ['/v1/decisions', '/v1/proofs/verify'])
      await expect(
        requestDesktopService(
          { ...r, path },
          { baseUrl: r.baseUrl, apiKey: 'policy-key' },
          signal(),
          fetcher
        )
      ).resolves.toEqual({ status: 200, bodyText: '{}' });
    await expect(
      requestDesktopService(
        { ...r, scope: undefined },
        { baseUrl: r.baseUrl, apiKey: 'policy-key' },
        signal(),
        fetcher
      )
    ).rejects.toThrow(/organization and brand/);
    await expect(
      requestDesktopService(
        r,
        { baseUrl: r.baseUrl, apiKey: 'another-brand-key' },
        signal(),
        fetcher
      )
    ).rejects.toThrow(/NSR connection changed/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('supports public health without borrowing saved credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await requestDesktopService(
      request({ method: 'GET', path: '/health', headers: {}, body: undefined }),
      { baseUrl, apiKey: '' },
      signal(),
      fetcher
    );
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({});
  });
  it('bounds response bytes instead of accepting an unbounded service body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
    await expect(
      requestDesktopService(request(), configuration, signal(), fetcher)
    ).rejects.toThrow(/too large/);
  });
  it('cancels a transport that ignores abort and redacts network failures', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    const pending = requestDesktopService(request(), configuration, controller.signal, fetcher);
    const check = expect(pending).rejects.toThrow(/cancelled|timed out/);
    controller.abort();
    await check;
    fetcher.mockRejectedValue(new Error('URL contains private-key-value'));
    await expect(
      requestDesktopService(request(), configuration, signal(), fetcher)
    ).rejects.toThrow('Desktop service could not be reached');
  });
  it('applies the deadline while waiting for response bytes', async () => {
    const cancel = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new ReadableStream({ cancel })));
    await expect(
      requestDesktopService(request({ timeoutMs: 20 }), configuration, signal(), fetcher)
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});
class Sender extends EventEmitter {
  isDestroyed() {
    return false;
  }
  send() {}
}
interface Event {
  sender: Sender;
  trusted: boolean;
}
class Ipc {
  handlers = new Map<string, (event: Event, ...args: unknown[]) => unknown>();
  handle(channel: string, handler: (event: Event, ...args: unknown[]) => unknown) {
    this.handlers.set(channel, handler);
  }
  removeHandler(channel: string) {
    this.handlers.delete(channel);
  }
  async invoke(sender: Sender, channel: string, value: unknown, trusted = true) {
    return await this.handlers.get(channel)!({ sender, trusted }, value);
  }
}
describe('desktop service IPC ownership', () => {
  it('rejects a policy response after its scoped key is replaced', async () => {
    const ipcMain = new Ipc();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let apiKey = 'policy-key';
    const registration = registerDesktopServiceIpc({
      ipcMain,
      fetcher,
      getConfiguration: () => ({ baseUrl: 'https://api.nsr.example', apiKey }),
      assertTrustedSender() {},
    });
    const pending = ipcMain.invoke(
      new Sender(),
      'service-api:request',
      request({
        service: 'nsr',
        baseUrl: 'https://api.nsr.example',
        path: '/v1/decisions',
        headers: { 'X-API-Key': 'policy-key', 'X-Org-ID': 'session-org' },
        scope: { tenantId: 'tenant', brandId: 'brand' },
      })
    );
    const rejected = expect(pending).rejects.toThrow(/NSR connection changed/);
    apiKey = 'replacement';
    finish(new Response('{"decision":"approved"}'));
    await rejected;
    registration.dispose();
  });
  it('checks the trusted document before reading credentials or dispatching', async () => {
    const ipcMain = new Ipc();
    const fetcher = vi.fn<typeof fetch>();
    const getConfiguration = vi.fn(() => configuration);
    const registration = registerDesktopServiceIpc({
      ipcMain,
      fetcher,
      getConfiguration,
      assertTrustedSender(event: Event) {
        if (!event.trusted) throw new Error('Untrusted');
      },
    });
    try {
      await expect(
        ipcMain.invoke(new Sender(), 'service-api:request', request(), false)
      ).rejects.toThrow('Untrusted');
      expect(getConfiguration).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      registration.dispose();
    }
  });
  it('owns cancellation, rejects duplicate IDs and limits concurrent operations', async () => {
    const ipcMain = new Ipc();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    const registration = registerDesktopServiceIpc({
      ipcMain,
      fetcher,
      getConfiguration: () => configuration,
      assertTrustedSender() {},
      maxActive: 1,
    });
    const owner = new Sender();
    const pending = ipcMain.invoke(owner, 'service-api:request', request());
    const rejected = expect(pending).rejects.toThrow();
    try {
      await expect(ipcMain.invoke(owner, 'service-api:request', request())).rejects.toThrow(
        /already active/
      );
      await expect(
        ipcMain.invoke(owner, 'service-api:request', request({ id: id(2) }))
      ).rejects.toThrow(/Too many/);
      await expect(ipcMain.invoke(new Sender(), 'service-api:cancel', id())).resolves.toBe(false);
      await expect(ipcMain.invoke(owner, 'service-api:cancel', id())).resolves.toBe(true);
      await rejected;
      expect(owner.listenerCount('destroyed')).toBe(0);
    } finally {
      registration.dispose();
    }
  });
  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'])(
    'cancels requests when the owning document is replaced (%s)',
    async (event) => {
      const ipcMain = new Ipc();
      const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
      const registration = registerDesktopServiceIpc({
        ipcMain,
        fetcher,
        getConfiguration: () => configuration,
        assertTrustedSender() {},
      });
      const owner = new Sender();
      const pending = ipcMain.invoke(owner, 'service-api:request', request());
      const rejected = expect(pending).rejects.toThrow();
      owner.emit(event, {}, 'https://other.example', false, true);
      await rejected;
      registration.dispose();
      expect(owner.listenerCount('destroyed')).toBe(0);
      expect(ipcMain.handlers.size).toBe(0);
    }
  );
  it('retains ownership during same-document and subframe navigation, then disposes outstanding work', async () => {
    const ipcMain = new Ipc();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    const registration = registerDesktopServiceIpc({
      ipcMain,
      fetcher,
      getConfiguration: () => configuration,
      assertTrustedSender() {},
    });
    const owner = new Sender();
    const pending = ipcMain.invoke(owner, 'service-api:request', request());
    const rejected = expect(pending).rejects.toThrow();
    const nativeSignal = fetcher.mock.calls[0][1]!.signal!;
    owner.emit('did-start-navigation', {}, 'https://app/#chat', true, true);
    owner.emit('did-start-navigation', {}, 'https://frame', false, false);
    expect(nativeSignal.aborted).toBe(false);
    registration.dispose();
    await rejected;
    expect(nativeSignal.aborted).toBe(true);
  });
});
