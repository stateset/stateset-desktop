import type { ElectronApplication, Page } from '@playwright/test';

/** Native fixtures avoid Electron CDP route fulfillment's opaque status-0 responses.
 * Only the temporary app's session is changed; CSP and web security remain enabled.
 */
export async function installDesktopApiFixture(
  electronApp: ElectronApplication,
  page: Page,
  fixture: {
    tenant: unknown;
    brand: unknown;
    sessions: unknown[];
    platforms?: string[];
    sessionsStatus?: number;
    actions?: { blocked?: boolean; failIds?: string[] };
  }
) {
  const apiOrigin = await page.evaluate(async () => {
    const configModule = '/src/config/api.config.ts';
    const { API_CONFIG } = await import(configModule);
    return new URL(API_CONFIG.baseUrl).origin;
  });
  const rendererOrigin = new URL(page.url()).origin;
  await electronApp.evaluate(
    (
      { session },
      { apiOrigin, rendererOrigin, tenant, brand, sessions, platforms, sessionsStatus, actions }
    ) => {
      const fixtureState = globalThis as typeof globalThis & {
        __desktopFixtureSessionStatus?: number;
        __desktopFixtureActions?: {
          blocked: boolean;
          failIds: string[];
          requests: { id: string; action: string }[];
          waiters: (() => void)[];
        };
      };
      fixtureState.__desktopFixtureSessionStatus = sessionsStatus;
      fixtureState.__desktopFixtureActions = {
        blocked: actions?.blocked ?? false,
        failIds: actions?.failIds ?? [],
        requests: [],
        waiters: [],
      };
      const records = sessions as Record<string, unknown>[];
      session.defaultSession.protocol.handle('https', async (request) => {
        const url = new URL(request.url);
        const headers = {
          'content-type': 'application/json',
          'access-control-allow-origin': rendererOrigin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers':
            'Authorization, Content-Type, X-Requested-With, X-API-Key, X-Tenant-ID',
        };
        if (url.origin !== apiOrigin) return new Response('Not a fixture service', { status: 404 });
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        let body: unknown;
        if (url.pathname.endsWith('/health/detailed'))
          body = {
            status: 'healthy',
            version: 'test',
            checks: {
              database: { status: 'healthy' },
              redis: { status: 'healthy' },
              nats: { status: 'healthy' },
            },
            circuit_breakers: {
              sandbox: 'closed',
              webhook: 'closed',
              database: 'closed',
              external_api: 'closed',
            },
            resilience_healthy: true,
          };
        else if (url.pathname.endsWith('/health')) body = { status: 'healthy' };
        else if (url.pathname.endsWith('/auth/me')) body = { tenant, brands: [brand] };
        else if (url.pathname.includes('/agents') && !url.pathname.includes('/stream')) {
          if (fixtureState.__desktopFixtureSessionStatus !== 200) {
            return new Response(JSON.stringify({ error: 'Fixture service unavailable' }), {
              status: fixtureState.__desktopFixtureSessionStatus,
              headers,
            });
          }
          const parts = url.pathname.split('/');
          const index = parts.lastIndexOf('agents');
          const id = parts[index + 1];
          const action = request.method === 'DELETE' ? 'delete' : parts[index + 2];
          if (
            id &&
            (request.method === 'DELETE' ||
              (request.method === 'POST' && (action === 'start' || action === 'stop')))
          ) {
            const controls = fixtureState.__desktopFixtureActions!;
            controls.requests.push({ id, action });
            if (controls.blocked)
              await new Promise<void>((resolve) => controls.waiters.push(resolve));
            if (controls.failIds.includes(id))
              return new Response(JSON.stringify({ error: 'Fixture action failed' }), {
                status: 400,
                headers,
              });
            const target = records.find((record) => record.id === id);
            if (!target) return new Response('{}', { status: 404, headers });
            if (action === 'delete') records.splice(records.indexOf(target), 1);
            else target.status = action === 'start' ? 'running' : 'stopped';
            body = { ok: true, session: target };
          } else
            body = id
              ? { ok: true, session: records.find((record) => record.id === id) }
              : { ok: true, sessions: records };
        } else if (url.pathname.includes('/secrets')) body = { ok: true, platforms };
        else
          return new Response(JSON.stringify({ error: 'Not a fixture route' }), {
            status: 404,
            headers,
          });
        return new Response(JSON.stringify(body), { status: 200, headers });
      });
    },
    {
      apiOrigin,
      rendererOrigin,
      tenant: fixture.tenant,
      brand: fixture.brand,
      sessions: fixture.sessions,
      platforms: fixture.platforms ?? ['shopify'],
      sessionsStatus: fixture.sessionsStatus ?? 200,
      actions: fixture.actions,
    }
  );
}

/** Change only this owned test app's response, without touching a real service. */
export async function setDesktopSessionResponse(electronApp: ElectronApplication, status: number) {
  await electronApp.evaluate((_, status) => {
    (
      globalThis as typeof globalThis & { __desktopFixtureSessionStatus?: number }
    ).__desktopFixtureSessionStatus = status;
  }, status);
}

/** Release only the pending requests in this owned desktop fixture. */
export async function configureDesktopActions(
  electronApp: ElectronApplication,
  options: { blocked?: boolean; failIds?: string[] }
) {
  await electronApp.evaluate((_, options) => {
    const controls = (
      globalThis as typeof globalThis & {
        __desktopFixtureActions: { blocked: boolean; failIds: string[]; waiters: (() => void)[] };
      }
    ).__desktopFixtureActions;
    if (options.failIds) controls.failIds = options.failIds;
    if (options.blocked !== undefined) controls.blocked = options.blocked;
    if (!controls.blocked) controls.waiters.splice(0).forEach((resolve) => resolve());
  }, options);
}
export async function getDesktopActionRequests(electronApp: ElectronApplication) {
  return electronApp.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __desktopFixtureActions: { requests: { id: string; action: string }[] };
        }
      ).__desktopFixtureActions.requests
  );
}
