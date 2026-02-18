/**
 * End-to-End Integration Tests
 *
 * Tests the full flow from Desktop App → Engine → Sandbox API
 *
 * Endpoints tested:
 * - Engine: https://engine.stateset.cloud.stateset.app
 * - Sandbox API: https://api.sandbox.stateset.app
 */

import { test, expect } from '@playwright/test';

const ENGINE_URL = 'https://engine.stateset.cloud.stateset.app';
const SANDBOX_API_URL = 'https://api.sandbox.stateset.app';

// API keys - Engine and Sandbox have different keys
const ENGINE_API_KEY = process.env.STATESET_ENGINE_API_KEY || '';
const SANDBOX_API_KEY = process.env.STATESET_SANDBOX_API_KEY || '';

test.describe('Service Health Checks', () => {
  test('Engine health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/health`);

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('orchestration-engine');
    expect(body.version).toBeDefined();

    console.log(`✓ Engine healthy - version ${body.version}`);
  });

  test('Sandbox API health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${SANDBOX_API_URL}/health`);

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');

    console.log(`✓ Sandbox API healthy - DB ${body.database}`);
  });
});

test.describe('Engine API Gateway', () => {
  test('Engine requires authentication for protected endpoints', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/v1/tenants/test/agents`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 400/401 without API key
    expect([400, 401]).toContain(response.status());
    console.log(`✓ Engine correctly requires authentication (${response.status()})`);
  });

  test('Engine rejects invalid API key', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/v1/tenants/test/agents`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'ApiKey invalid-key-12345',
      },
    });

    // Should return 400/401/403 for invalid key
    expect([400, 401, 403]).toContain(response.status());
    console.log(`✓ Engine correctly rejects invalid API key (${response.status()})`);
  });
});

test.describe('Authenticated Engine Flow', () => {
  test.skip(!ENGINE_API_KEY, 'Skipping authenticated tests - STATESET_ENGINE_API_KEY not set');

  test('Engine authenticates and returns tenant info', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/v1/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${ENGINE_API_KEY}`,
      },
    });

    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.tenant).toBeDefined();
    expect(body.tenant.id).toBeDefined();
    expect(body.brands).toBeDefined();

    console.log(`✓ Authenticated as tenant: ${body.tenant.name || body.tenant.id}`);
    console.log(`  Brands: ${body.brands.length}`);
  });

  test('Engine can list agent sessions', async ({ request }) => {
    // First authenticate to get tenant ID
    const authResponse = await request.get(`${ENGINE_URL}/api/v1/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${ENGINE_API_KEY}`,
      },
    });

    expect(authResponse.ok()).toBe(true);
    const authBody = await authResponse.json();
    const tenantId = authBody.tenant.id;

    // Now list sessions
    const sessionsResponse = await request.get(`${ENGINE_URL}/api/v1/tenants/${tenantId}/agents`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${ENGINE_API_KEY}`,
      },
    });

    expect(sessionsResponse.ok()).toBe(true);

    const sessionsBody = await sessionsResponse.json();
    expect(sessionsBody.ok).toBe(true);
    expect(sessionsBody.sessions).toBeDefined();
    expect(Array.isArray(sessionsBody.sessions)).toBe(true);

    console.log(`✓ Listed ${sessionsBody.sessions.length} agent sessions`);
  });
});

test.describe('Sandbox API Integration', () => {
  test.skip(!SANDBOX_API_KEY, 'Skipping sandbox tests - STATESET_SANDBOX_API_KEY not set');

  test('Sandbox API can create a new sandbox environment', async ({ request }) => {
    const response = await request.post(`${SANDBOX_API_URL}/api/sandbox/create`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${SANDBOX_API_KEY}`,
      },
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.sandbox_id).toBeDefined();
    expect(body.status).toBe('running');
    expect(body.pod_ip).toBeDefined();

    console.log(`✓ Sandbox created: ${body.sandbox_id}`);
    console.log(`  Status: ${body.status}`);
    console.log(`  Pod IP: ${body.pod_ip}`);
    console.log(`  Startup: ${body.startup_metrics?.total_ms}ms`);

    // Store sandbox_id for cleanup or further tests
    return body.sandbox_id;
  });

  test('Sandbox API can list active sandboxes', async ({ request }) => {
    const response = await request.get(`${SANDBOX_API_URL}/api/sandbox`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${SANDBOX_API_KEY}`,
      },
    });

    // May return 200 or 404 if no endpoint exists
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      console.log(`✓ Listed sandboxes: ${JSON.stringify(body).slice(0, 100)}...`);
    } else {
      console.log('✓ Sandbox list endpoint not available (404)');
    }
  });
});

test.describe('End-to-End Flow Validation', () => {
  test('Complete request flow: Desktop → Engine → Sandbox', async ({ request }) => {
    console.log('\n=== End-to-End Flow Test ===\n');

    // Step 1: Check Engine Health
    console.log('Step 1: Checking Engine health...');
    const engineHealth = await request.get(`${ENGINE_URL}/health`);
    expect(engineHealth.ok()).toBe(true);
    const engineStatus = await engineHealth.json();
    console.log(`  ✓ Engine: ${engineStatus.status} (v${engineStatus.version})`);

    // Step 2: Check Sandbox API Health
    console.log('Step 2: Checking Sandbox API health...');
    const sandboxHealth = await request.get(`${SANDBOX_API_URL}/health`);
    expect(sandboxHealth.ok()).toBe(true);
    const sandboxStatus = await sandboxHealth.json();
    console.log(`  ✓ Sandbox API: ${sandboxStatus.status} (DB: ${sandboxStatus.database})`);

    // Step 3: Verify Engine API Gateway
    console.log('Step 3: Verifying Engine API Gateway...');
    const gatewayTest = await request.get(`${ENGINE_URL}/api/v1/tenants/test/agents`);
    expect([400, 401]).toContain(gatewayTest.status());
    console.log(`  ✓ API Gateway: Authentication required (${gatewayTest.status()})`);

    // Step 4: Authenticate with Engine
    if (ENGINE_API_KEY) {
      console.log('Step 4: Authenticating with Engine...');
      const authTest = await request.get(`${ENGINE_URL}/api/v1/auth/me`, {
        headers: {
          Authorization: `ApiKey ${ENGINE_API_KEY}`,
        },
      });

      expect(authTest.ok()).toBe(true);
      const authData = await authTest.json();
      console.log(`  ✓ Tenant: ${authData.tenant?.name} (${authData.tenant?.tier})`);
      console.log(`  ✓ Brands: ${authData.brands?.length || 0}`);

      // Step 5: List Agent Sessions
      if (authData.tenant?.id) {
        console.log('Step 5: Listing agent sessions...');
        const sessionsResp = await request.get(
          `${ENGINE_URL}/api/v1/tenants/${authData.tenant.id}/agents`,
          {
            headers: {
              Authorization: `ApiKey ${ENGINE_API_KEY}`,
            },
          }
        );

        expect(sessionsResp.ok()).toBe(true);
        const sessionsData = await sessionsResp.json();
        console.log(`  ✓ Sessions: ${sessionsData.sessions?.length || 0} active`);
      }
    } else {
      console.log('Step 4-5: Skipped (no ENGINE_API_KEY)');
    }

    // Step 6: Create Sandbox Environment
    if (SANDBOX_API_KEY) {
      console.log('Step 6: Creating Sandbox environment...');
      const sandboxResp = await request.post(`${SANDBOX_API_URL}/api/sandbox/create`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `ApiKey ${SANDBOX_API_KEY}`,
        },
      });

      expect(sandboxResp.status()).toBe(201);
      const sandboxData = await sandboxResp.json();
      console.log(`  ✓ Sandbox ID: ${sandboxData.sandbox_id}`);
      console.log(`  ✓ Status: ${sandboxData.status}`);
      console.log(`  ✓ Pod IP: ${sandboxData.pod_ip}`);
      console.log(`  ✓ Startup time: ${sandboxData.startup_metrics?.total_ms}ms`);
      console.log(`  ✓ Expires: ${sandboxData.expires_at}`);
    } else {
      console.log('Step 6: Skipped (no SANDBOX_API_KEY)');
    }

    console.log('\n=== Full E2E Flow Complete ===\n');
  });
});

test.describe('Latency & Performance', () => {
  test('Engine health check latency is acceptable', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${ENGINE_URL}/health`);
    const latency = Date.now() - start;

    expect(response.ok()).toBe(true);
    expect(latency).toBeLessThan(2000); // Should respond within 2 seconds

    console.log(`✓ Engine latency: ${latency}ms`);
  });

  test('Sandbox API health check latency is acceptable', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${SANDBOX_API_URL}/health`);
    const latency = Date.now() - start;

    expect(response.ok()).toBe(true);
    expect(latency).toBeLessThan(2000); // Should respond within 2 seconds

    console.log(`✓ Sandbox API latency: ${latency}ms`);
  });
});
