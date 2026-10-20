import type { ElectronApplication, Page } from '@playwright/test';

/** Native fixtures avoid Electron CDP route fulfillment's opaque status-0 responses.
 * Only the temporary app's session is changed; CSP and web security remain enabled.
 */
export async function installDesktopApiFixture(
  electronApp: ElectronApplication,
  page: Page,
  fixture: {
    tenant: unknown;
    apiOrigin?: string;
    brand: unknown;
    sessions: unknown[];
    platforms?: string[];
    sessionsStatus?: number;
    sandboxChats?: boolean;
    actions?: { blocked?: boolean; failIds?: string[] };
  }
) {
  const apiOrigin = fixture.apiOrigin
    ? new URL(fixture.apiOrigin).origin
    : await page.evaluate(async () => {
        const configModule = '/src/config/api.config.ts';
        const { API_CONFIG } = await import(configModule);
        return new URL(API_CONFIG.baseUrl).origin;
      });
  const rendererOrigin = new URL(page.url()).origin;
  await electronApp.evaluate(
    (
      { session },
      {
        apiOrigin,
        rendererOrigin,
        tenant,
        brand,
        sessions,
        platforms,
        sessionsStatus,
        actions,
        sandboxChats,
      }
    ) => {
      const fixtureState = globalThis as typeof globalThis & {
        __desktopSandboxChats?: {
          sessions: Record<
            string,
            { id: string; organizationId: string; status: string; currentSandboxId: string | null }
          >;
          creates: Record<string, string>;
          tamperNextReceipt?: boolean;
          holdStarts?: boolean;
          startWaiters: (() => void)[];
          requests: {
            path: string;
            method: string;
            idempotencyKey: string | null;
            body?: unknown;
          }[];
        };
        __desktopFixtureSessionStatus?: number;
        __desktopFixtureActions?: {
          blocked: boolean;
          failIds: string[];
          requests: { id: string; action: string }[];
          waiters: (() => void)[];
        };
      };
      fixtureState.__desktopFixtureSessionStatus = sessionsStatus;
      if (sandboxChats)
        fixtureState.__desktopSandboxChats = {
          sessions: {},
          creates: {},
          requests: [],
          startWaiters: [],
        };
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
            'Authorization, Content-Type, X-Requested-With, X-API-Key, X-Org-ID, X-Tenant-ID, Idempotency-Key',
        };
        if (sandboxChats && url.origin === 'https://api.nsr.stateset.com') {
          if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
          if (
            request.headers.get('X-API-Key') !== 'native-policy-test-key' ||
            request.headers.get('X-Org-ID') !== 'sandbox-test-org'
          )
            return new Response('{}', { status: 401, headers });
          if (request.method !== 'POST') return new Response('{}', { status: 404, headers });
          const body = await request.json();
          const state = fixtureState.__desktopSandboxChats!;
          state.requests.push({
            path: url.pathname,
            method: request.method,
            idempotencyKey: request.headers.get('Idempotency-Key'),
            body,
          });
          if (url.pathname === '/v1/proofs/verify')
            return new Response(JSON.stringify({ verified: true }), { status: 200, headers });
          if (url.pathname !== '/v1/decisions') return new Response('{}', { status: 404, headers });
          if (!state.sessions[body.session_id]) return new Response('{}', { status: 403, headers });
          const passed = body.facts[0].predicate.args[2] === true;
          const goal = body.authorization_goal;
          const terms = goal.args.map((value: string) => ({ Constant: value }));
          if (state.tamperNextReceipt) {
            terms[1] = { Constant: 'wrong-file-request' };
            state.tamperNextReceipt = false;
          }
          return new Response(
            JSON.stringify({
              decision_id: `native-decision-${body.external_ref}`,
              decision: passed ? 'approved' : 'refused',
              shadow: false,
              routing: { band: passed ? 'act' : 'escalate' },
              rationale: passed
                ? 'Fixture observation matches the explicit check.'
                : 'Fixture observation failed.',
              ...(passed
                ? {
                    verifiable_bundle: {
                      org_id: 'sandbox-test-org',
                      facts: [],
                      rules: [],
                      proof: { goal: { predicate: goal.name, terms } },
                    },
                  }
                : {}),
            }),
            { status: 200, headers }
          );
        }
        if (sandboxChats && url.origin === 'https://api.sandbox.stateset.app') {
          if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
          if (request.headers.get('Authorization') !== 'ApiKey native-sandbox-test-key')
            return new Response('{}', { status: 401, headers });
          const state = fixtureState.__desktopSandboxChats!;
          const body =
            request.method === 'POST' ? await request.json().catch(() => undefined) : undefined;
          const idempotencyKey = request.headers.get('Idempotency-Key');
          state.requests.push({ path: url.pathname, method: request.method, idempotencyKey, body });
          const workspace = url.pathname.match(
            /^\/api\/v1\/agent\/sessions\/([^/]+)\/workspace\/read$/
          );
          if (workspace && request.method === 'POST') {
            const session = state.sessions[workspace[1]];
            if (!session || session.status !== 'running' || body?.path !== '/workspace/report.txt')
              return new Response('{}', { status: 404, headers });
            const bytes = new TextEncoder().encode('Sandbox report: $42\n');
            const digest = Array.from(
              new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
              (byte) => byte.toString(16).padStart(2, '0')
            ).join('');
            return new Response(
              JSON.stringify({
                path: body.path,
                sha256: digest,
                size_bytes: bytes.length,
                media_type: 'text/plain',
                content_base64: Buffer.from(bytes).toString('base64'),
              }),
              { status: 200, headers }
            );
          }
          let value: unknown;
          if (url.pathname === '/api/v1/agent/sessions' && request.method === 'POST') {
            if (!idempotencyKey) return new Response('{}', { status: 400, headers });
            const id = state.creates[idempotencyKey] ?? crypto.randomUUID();
            state.creates[idempotencyKey] = id;
            state.sessions[id] ??= {
              id,
              organizationId: 'sandbox-test-org',
              status: 'pending',
              currentSandboxId: null,
            };
            value = state.sessions[id];
          } else {
            const match = url.pathname.match(
              /^\/api\/v1\/agent\/sessions\/([^/]+)(?:\/(start|stop))?$/
            );
            const session = match && state.sessions[match[1]];
            if (!match || !session) return new Response('{}', { status: 404, headers });
            if (request.method === 'POST' && match[2] === 'start') {
              if (state.holdStarts)
                await new Promise<void>((resolve) => state.startWaiters.push(resolve));
              session.status = 'running';
              session.currentSandboxId = `sandbox-${session.id}`;
            }
            if (request.method === 'POST' && match[2] === 'stop') session.status = 'completed';
            value = session;
          }
          return new Response(JSON.stringify(value), { status: 200, headers });
        }
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
      sandboxChats: fixture.sandboxChats,
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
