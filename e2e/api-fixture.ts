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
  }
) {
  const apiOrigin = await page.evaluate(async () => {
    const configModule = '/src/config/api.config.ts';
    const { API_CONFIG } = await import(configModule);
    return new URL(API_CONFIG.baseUrl).origin;
  });
  await electronApp.evaluate(
    ({ session }, { apiOrigin, tenant, brand, sessions, platforms, sessionsStatus }) => {
      const fixtureState = globalThis as typeof globalThis & {
        __desktopFixtureSessionStatus?: number;
      };
      fixtureState.__desktopFixtureSessionStatus = sessionsStatus;
      session.defaultSession.protocol.handle('https', (request) => {
        const url = new URL(request.url);
        const headers = {
          'content-type': 'application/json',
          'access-control-allow-origin': 'http://localhost:5173',
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
          body = { ok: true, sessions };
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
      tenant: fixture.tenant,
      brand: fixture.brand,
      sessions: fixture.sessions,
      platforms: fixture.platforms ?? ['shopify'],
      sessionsStatus: fixture.sessionsStatus ?? 200,
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
