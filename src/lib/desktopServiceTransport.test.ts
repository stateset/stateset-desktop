// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { desktopServiceFetch } from './desktopServiceTransport';
const original = window.electronAPI;
afterEach(() => {
  window.electronAPI = original;
  vi.unstubAllGlobals();
});
function native() {
  const serviceApi = {
    request: vi.fn().mockResolvedValue({ status: 201, bodyText: '{"id":"owned"}' }),
    cancel: vi.fn().mockResolvedValue(true),
  };
  window.electronAPI = { ...original, serviceApi } as NonNullable<Window['electronAPI']>;
  return serviceApi;
}
it('uses the native saved-connection transport and preserves the JSON/status', async () => {
  const serviceApi = native();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const response = await desktopServiceFetch(
    'sandbox',
    'https://api.sandbox.example',
    '/api/v1/agent/sessions',
    { method: 'POST', body: '{}', headers: { Authorization: 'ApiKey key' } },
    { timeoutMs: 15000 }
  );
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ id: 'owned' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(serviceApi.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      body: '{}',
      timeoutMs: 15000,
      headers: { authorization: 'ApiKey key' },
    })
  );
});
it('passes the original policy scope and never falls back to browser fetch after a native rejection', async () => {
  const serviceApi = native();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  serviceApi.request.mockRejectedValue(new Error('Scope changed'));
  await expect(
    desktopServiceFetch(
      'nsr',
      'https://api.nsr.example',
      '/v1/decisions',
      { method: 'POST', body: '{}' },
      { timeoutMs: 30000, scope: { tenantId: 'original', brandId: 'brand' } }
    )
  ).rejects.toThrow('Scope changed');
  expect(serviceApi.request).toHaveBeenCalledWith(
    expect.objectContaining({ scope: { tenantId: 'original', brandId: 'brand' } })
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('cancels only its own native operation and rejects promptly', async () => {
  const serviceApi = native();
  serviceApi.request.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const pending = desktopServiceFetch(
    'sandbox',
    'https://api.sandbox.example',
    '/api/v1/agent/sessions/owned',
    { signal: controller.signal },
    { timeoutMs: 1000 }
  );
  const rejected = expect(pending).rejects.toThrow(/cancelled/);
  controller.abort();
  await rejected;
  expect(serviceApi.cancel).toHaveBeenCalledWith(serviceApi.request.mock.calls[0][0].id);
});
it('does not dispatch an already cancelled request', async () => {
  const serviceApi = native();
  const controller = new AbortController();
  controller.abort();
  await expect(
    desktopServiceFetch(
      'sandbox',
      'https://api.sandbox.example',
      '/health',
      { signal: controller.signal },
      { timeoutMs: 1000 }
    )
  ).rejects.toThrow();
  expect(serviceApi.request).not.toHaveBeenCalled();
});
it('handles an empty successful response', async () => {
  const serviceApi = native();
  serviceApi.request.mockResolvedValue({ status: 204, bodyText: '' });
  expect(
    (
      await desktopServiceFetch(
        'sandbox',
        'https://api.sandbox.example',
        '/health',
        {},
        { timeoutMs: 1000 }
      )
    ).status
  ).toBe(204);
});
it('retains browser transport in a preview without the native bridge', async () => {
  window.electronAPI = { ...original, serviceApi: undefined } as NonNullable<Window['electronAPI']>;
  const response = new Response('{}');
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  const init = { method: 'GET' };
  await expect(
    desktopServiceFetch('sandbox', 'https://api.sandbox.example', '/health', init, {
      timeoutMs: 1000,
    })
  ).resolves.toBe(response);
  expect(fetcher).toHaveBeenCalledWith('https://api.sandbox.example/health', init);
});
