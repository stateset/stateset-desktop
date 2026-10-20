import { test, expect, requireDesktopDisplay } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
test.beforeAll(() => requireDesktopDisplay());
for (const packaged of [false, true]) {
  test(`saved service API connections work without CORS in ${packaged ? 'file' : 'development'} mode`, async ({
    desktop,
  }) => {
    const application = await desktop.launch(desktop.createProfile({ packaged }));
    const page = await application.firstWindow();
    await page.waitForURL(packaged ? /^file:\/\// : `${DESKTOP_TEST_ORIGIN}/**`);
    await application.evaluate(({ session }) => {
      const state = globalThis as typeof globalThis & {
        __serviceRequests?: { host: string; path: string; method: string }[];
      };
      state.__serviceRequests = [];
      session.defaultSession.protocol.handle('https', async (request) => {
        const url = new URL(request.url);
        state.__serviceRequests!.push({
          host: url.host,
          path: url.pathname,
          method: request.method,
        });
        // Deliberately no Access-Control-Allow-* headers; the desktop bridge does not need them.
        const headers = { 'Content-Type': 'application/json' };
        if (request.method === 'OPTIONS') return new Response('{}', { status: 401, headers });
        if (url.host === 'api.sandbox.stateset.app') {
          if (request.headers.get('Authorization') !== 'ApiKey native-owned-key')
            return new Response('{}', { status: 401, headers });
          if (url.pathname.endsWith('/redirect'))
            return new Response(null, {
              status: 302,
              headers: { Location: 'https://untrusted.example/credentials' },
            });
          return new Response(JSON.stringify({ computer_use: true, inference_ready: true }), {
            headers,
          });
        }
        if (
          url.host === 'api.nsr.stateset.com' &&
          request.headers.get('X-API-Key') === 'native-owned-policy' &&
          request.headers.get('X-Org-ID') === 'session-org'
        )
          return new Response('{"decision":"denied"}', { headers });
        return new Response('{}', { status: 403, headers });
      });
    });
    await page.evaluate(async () => {
      await window.electronAPI!.auth.setSandboxApiKey('native-owned-key');
      await window.electronAPI!.secrets.setLocal(
        JSON.stringify({
          tenant: {
            brand: {
              'computer-chat-policy': {
                credentials: { api_key: 'native-owned-policy' },
                updated_at: new Date().toISOString(),
              },
            },
          },
        })
      );
    });
    const outcomes = await page.evaluate(async () => {
      const api = window.electronAPI!.serviceApi!;
      const common = {
        baseUrl: 'https://api.sandbox.stateset.app',
        service: 'sandbox' as const,
        method: 'GET' as const,
        headers: { Authorization: 'ApiKey native-owned-key' },
        timeoutMs: 1000,
      };
      const sandbox = await api.request({
        ...common,
        id: crypto.randomUUID(),
        path: '/api/v1/agent/sessions/capabilities',
      });
      const policy = await api.request({
        id: crypto.randomUUID(),
        baseUrl: 'https://api.nsr.stateset.com',
        service: 'nsr',
        method: 'POST',
        path: '/v1/decisions',
        headers: {
          'X-API-Key': 'native-owned-policy',
          'X-Org-ID': 'session-org',
          'Content-Type': 'application/json',
        },
        scope: { tenantId: 'tenant', brandId: 'brand' },
        body: '{}',
        timeoutMs: 1000,
      });
      let foreignScopeRejected = false;
      try {
        await api.request({
          id: crypto.randomUUID(),
          baseUrl: 'https://api.nsr.stateset.com',
          service: 'nsr',
          method: 'POST',
          path: '/v1/decisions',
          headers: { 'X-API-Key': 'native-owned-policy', 'X-Org-ID': 'session-org' },
          scope: { tenantId: 'tenant', brandId: 'another-brand' },
          body: '{}',
          timeoutMs: 1000,
        });
      } catch {
        foreignScopeRejected = true;
      }
      const rejected = async (patch: Record<string, unknown>) => {
        try {
          await api.request({
            ...common,
            id: crypto.randomUUID(),
            path: '/api/v1/agent/sessions/capabilities',
            ...patch,
          });
          return false;
        } catch {
          return true;
        }
      };
      return {
        sandbox,
        policy,
        foreignScopeRejected,
        changedKeyRejected: await rejected({ headers: { Authorization: 'ApiKey older-key' } }),
        foreignEndpointRejected: await rejected({ baseUrl: 'https://untrusted.example' }),
        unlistedPathRejected: await rejected({ path: '/api/admin/secrets' }),
        redirectRejected: await rejected({ path: '/api/v1/agent/sessions/redirect' }),
      };
    });
    expect(outcomes.sandbox.status).toBe(200);
    expect(JSON.parse(outcomes.sandbox.bodyText)).toEqual({
      computer_use: true,
      inference_ready: true,
    });
    expect(outcomes.policy.status).toBe(200);
    expect(outcomes.foreignScopeRejected).toBe(true);
    expect(outcomes.changedKeyRejected).toBe(true);
    expect(outcomes.foreignEndpointRejected).toBe(true);
    expect(outcomes.unlistedPathRejected).toBe(true);
    expect(outcomes.redirectRejected).toBe(true);
    const calls = await application.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            __serviceRequests: { host: string; path: string; method: string }[];
          }
        ).__serviceRequests
    );
    expect(calls.filter((call) => call.method === 'OPTIONS')).toHaveLength(0);
    expect(calls.filter((call) => call.host === 'untrusted.example')).toHaveLength(0);
    expect(
      calls.filter((call) => call.path === '/api/v1/agent/sessions/capabilities')
    ).toHaveLength(1);
    expect(calls.filter((call) => call.path === '/v1/decisions')).toHaveLength(1);
  });
}
