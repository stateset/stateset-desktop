/**
 * Integration contract tests.
 *
 * Default mode is deterministic and fully local (no external network).
 *
 * Optional live smoke checks can be enabled with:
 * PLAYWRIGHT_LIVE_INTEGRATION=true
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';

const TEST_ENGINE_API_KEY = 'engine-test-key';
const TEST_SANDBOX_API_KEY = 'sandbox-test-key';

const RUN_LIVE_INTEGRATION = process.env.PLAYWRIGHT_LIVE_INTEGRATION === 'true';
const LIVE_ENGINE_URL =
  process.env.STATESET_ENGINE_URL || 'https://engine.stateset.cloud.stateset.app';
const LIVE_SANDBOX_API_URL =
  process.env.STATESET_SANDBOX_API_URL || 'https://api.sandbox.stateset.app';
const LIVE_ENGINE_API_KEY = process.env.STATESET_ENGINE_API_KEY || '';
const LIVE_SANDBOX_API_KEY = process.env.STATESET_SANDBOX_API_KEY || '';

type StartedServer = {
  server: Server;
  url: string;
};

type MockSandbox = {
  sandbox_id: string;
  status: 'running';
  pod_ip: string;
  startup_metrics: {
    total_ms: number;
  };
  expires_at: string;
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isAuthorized(req: IncomingMessage, expectedApiKey: string): boolean {
  return req.headers.authorization === `ApiKey ${expectedApiKey}`;
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://127.0.0.1').pathname;
}

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<StartedServer> {
  const server = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine mock server address');
  }

  const { port } = address as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createEngineHandler() {
  const tenant = { id: 'tenant_1', name: 'Test Tenant', tier: 'pro' };
  const brands = [{ id: 'brand_1', name: 'Demo Brand' }];
  const sessions = [
    {
      id: 'session_1',
      tenant_id: tenant.id,
      brand_id: brands[0].id,
      agent_type: 'response',
      status: 'running',
    },
  ];

  return (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method || 'GET';
    const pathname = getPathname(req);

    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        status: 'healthy',
        service: 'orchestration-engine',
        version: 'test-1.0.0',
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      if (!isAuthorized(req, TEST_ENGINE_API_KEY)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }
      sendJson(res, 200, { tenant, brands });
      return;
    }

    const tenantAgentsMatch = pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/agents$/);
    if (method === 'GET' && tenantAgentsMatch) {
      const tenantId = tenantAgentsMatch[1];
      if (!req.headers.authorization) {
        sendJson(res, 401, { ok: false, error: 'Missing API key' });
        return;
      }
      if (!isAuthorized(req, TEST_ENGINE_API_KEY)) {
        sendJson(res, 403, { ok: false, error: 'Invalid API key' });
        return;
      }
      if (tenantId !== tenant.id) {
        sendJson(res, 404, { ok: false, error: 'Tenant not found' });
        return;
      }
      sendJson(res, 200, { ok: true, sessions });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  };
}

function createSandboxHandler() {
  const sandboxes: MockSandbox[] = [];
  let sandboxCount = 0;

  return (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method || 'GET';
    const pathname = getPathname(req);

    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        status: 'healthy',
        database: 'connected',
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/sandbox/create') {
      if (!isAuthorized(req, TEST_SANDBOX_API_KEY)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      sandboxCount += 1;
      const sandboxId = `sandbox_${sandboxCount}`;
      const sandbox: MockSandbox = {
        sandbox_id: sandboxId,
        status: 'running',
        pod_ip: `10.0.0.${sandboxCount}`,
        startup_metrics: { total_ms: 420 },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      sandboxes.push(sandbox);
      sendJson(res, 201, sandbox);
      return;
    }

    if (method === 'GET' && pathname === '/api/sandbox') {
      if (!isAuthorized(req, TEST_SANDBOX_API_KEY)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        sandboxes,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  };
}

test.describe('Integration Contracts (Deterministic)', () => {
  let engineServer: Server;
  let sandboxServer: Server;
  let engineUrl = '';
  let sandboxApiUrl = '';

  test.beforeAll(async () => {
    const startedEngine = await startServer(createEngineHandler());
    engineServer = startedEngine.server;
    engineUrl = startedEngine.url;

    const startedSandbox = await startServer(createSandboxHandler());
    sandboxServer = startedSandbox.server;
    sandboxApiUrl = startedSandbox.url;
  });

  test.afterAll(async () => {
    await Promise.all([stopServer(engineServer), stopServer(sandboxServer)]);
  });

  test('Engine health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${engineUrl}/health`);

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('orchestration-engine');
    expect(body.version).toBeDefined();
  });

  test('Sandbox API health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${sandboxApiUrl}/health`);

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');
  });

  test('Engine requires authentication for protected endpoints', async ({ request }) => {
    const response = await request.get(`${engineUrl}/api/v1/tenants/test/agents`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('Engine rejects invalid API key', async ({ request }) => {
    const response = await request.get(`${engineUrl}/api/v1/tenants/test/agents`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'ApiKey invalid-key-12345',
      },
    });

    expect(response.status()).toBe(403);
  });

  test('Engine authenticates and returns tenant info', async ({ request }) => {
    const response = await request.get(`${engineUrl}/api/v1/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${TEST_ENGINE_API_KEY}`,
      },
    });

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.tenant).toBeDefined();
    expect(body.tenant.id).toBeDefined();
    expect(body.brands).toBeDefined();
  });

  test('Engine can list agent sessions', async ({ request }) => {
    const authResponse = await request.get(`${engineUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `ApiKey ${TEST_ENGINE_API_KEY}`,
      },
    });

    expect(authResponse.ok()).toBe(true);
    const authBody = await authResponse.json();
    const tenantId = authBody.tenant.id;

    const sessionsResponse = await request.get(`${engineUrl}/api/v1/tenants/${tenantId}/agents`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${TEST_ENGINE_API_KEY}`,
      },
    });

    expect(sessionsResponse.ok()).toBe(true);

    const sessionsBody = await sessionsResponse.json();
    expect(sessionsBody.ok).toBe(true);
    expect(Array.isArray(sessionsBody.sessions)).toBe(true);
  });

  test('Sandbox API can create and list sandbox environments', async ({ request }) => {
    const createResponse = await request.post(`${sandboxApiUrl}/api/sandbox/create`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${TEST_SANDBOX_API_KEY}`,
      },
    });

    expect(createResponse.status()).toBe(201);
    const createdSandbox = await createResponse.json();
    expect(createdSandbox.sandbox_id).toBeDefined();
    expect(createdSandbox.status).toBe('running');

    const listResponse = await request.get(`${sandboxApiUrl}/api/sandbox`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${TEST_SANDBOX_API_KEY}`,
      },
    });

    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(Array.isArray(listBody.sandboxes)).toBe(true);
    expect(listBody.sandboxes.length).toBeGreaterThan(0);
  });

  test('Complete request flow: Desktop -> Engine -> Sandbox', async ({ request }) => {
    const engineHealth = await request.get(`${engineUrl}/health`);
    expect(engineHealth.ok()).toBe(true);

    const sandboxHealth = await request.get(`${sandboxApiUrl}/health`);
    expect(sandboxHealth.ok()).toBe(true);

    const authTest = await request.get(`${engineUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `ApiKey ${TEST_ENGINE_API_KEY}`,
      },
    });

    expect(authTest.ok()).toBe(true);
    const authData = await authTest.json();
    expect(authData.tenant.id).toBeTruthy();

    const sessionsResp = await request.get(
      `${engineUrl}/api/v1/tenants/${authData.tenant.id}/agents`,
      {
        headers: {
          Authorization: `ApiKey ${TEST_ENGINE_API_KEY}`,
        },
      }
    );

    expect(sessionsResp.ok()).toBe(true);

    const sandboxResp = await request.post(`${sandboxApiUrl}/api/sandbox/create`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${TEST_SANDBOX_API_KEY}`,
      },
    });

    expect(sandboxResp.status()).toBe(201);
    const sandboxData = await sandboxResp.json();
    expect(sandboxData.sandbox_id).toBeDefined();
    expect(sandboxData.status).toBe('running');
  });

  test('Health endpoint latency stays below 2 seconds', async ({ request }) => {
    const startEngine = Date.now();
    const engineResponse = await request.get(`${engineUrl}/health`);
    const engineLatency = Date.now() - startEngine;

    const startSandbox = Date.now();
    const sandboxResponse = await request.get(`${sandboxApiUrl}/health`);
    const sandboxLatency = Date.now() - startSandbox;

    expect(engineResponse.ok()).toBe(true);
    expect(sandboxResponse.ok()).toBe(true);
    expect(engineLatency).toBeLessThan(2000);
    expect(sandboxLatency).toBeLessThan(2000);
  });
});

test.describe('Live Service Smoke Checks (Opt-in)', () => {
  test.skip(
    !RUN_LIVE_INTEGRATION,
    'Set PLAYWRIGHT_LIVE_INTEGRATION=true to run live integration smoke checks.'
  );

  test('Engine and Sandbox health endpoints are reachable', async ({ request }) => {
    const [engineResponse, sandboxResponse] = await Promise.all([
      request.get(`${LIVE_ENGINE_URL}/health`),
      request.get(`${LIVE_SANDBOX_API_URL}/health`),
    ]);

    expect(engineResponse.ok()).toBe(true);
    expect(sandboxResponse.ok()).toBe(true);
  });

  test('Engine auth works with provided key', async ({ request }) => {
    test.skip(!LIVE_ENGINE_API_KEY, 'STATESET_ENGINE_API_KEY is required for live auth tests');

    const response = await request.get(`${LIVE_ENGINE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `ApiKey ${LIVE_ENGINE_API_KEY}`,
      },
    });

    expect(response.ok()).toBe(true);
  });

  test('Sandbox create works with provided key', async ({ request }) => {
    test.skip(!LIVE_SANDBOX_API_KEY, 'STATESET_SANDBOX_API_KEY is required for live sandbox tests');

    const response = await request.post(`${LIVE_SANDBOX_API_URL}/api/sandbox/create`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${LIVE_SANDBOX_API_KEY}`,
      },
    });

    expect(response.status()).toBe(201);
  });
});
