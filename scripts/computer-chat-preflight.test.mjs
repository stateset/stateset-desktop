import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { computerChatPreflight } from './computer-chat-preflight.mjs';
import requiredChecks from '../src/features/computer-chat/setup-checks.json' with { type: 'json' };

const engineKey = 'owned-engine-fixture-key';
const policyKey = 'owned-policy-fixture-key';
const tenant = '11111111-1111-4111-8111-111111111111';
const brand = '22222222-2222-4222-8222-222222222222';
const ready = () => ({
  version: 1,
  ready: true,
  checks: requiredChecks.map((key) => ({ key, status: 'pass', message: 'Configured' })),
  mcp_servers: [],
});

async function fixture(options, run) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    requests.push({
      path: request.url,
      method: request.method,
      auth: request.headers.authorization,
      tenant: request.headers['x-tenant-id'],
      body: text ? JSON.parse(text) : undefined,
    });
    const reply = (value, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (options.apiKeyOnly && request.headers.authorization?.startsWith('Bearer ')) {
      reply({ error: engineKey }, 401);
    } else if (request.url === '/health') {
      if (options.hang) return;
      if (options.oversized) return response.end('x'.repeat(70000));
      if (options.invalidJson) return response.end('<html>unavailable</html>');
      reply(
        options.health ?? { status: 'ok', database: { ok: true }, temporal: { ok: true } },
        options.healthStatus ?? 200
      );
    } else if (request.url === '/v1/computer-chats/diagnostics') {
      if (options.redirect) {
        response.writeHead(307, { Location: '/must-not-follow' });
        response.end();
      } else reply(options.report ?? ready(), options.reportStatus ?? 200);
    } else if (request.url === '/api/v1/policy/computer/capabilities') {
      reply(
        options.policy ?? {
          version: 1,
          organization_id: tenant,
          criteria: ['contains', 'equals', 'json', 'sha256', 'png'],
          max_artifacts: 4,
          max_artifact_bytes: 131072,
          max_total_bytes: 524288,
        }
      );
    } else reply({ error: 'Unexpected request' }, 404);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const environment = {
    CHAT_TEST_ENGINE_URL: url,
    CHAT_TEST_ENGINE_KEY: engineKey,
    CHAT_TEST_TENANT_ID: tenant,
    CHAT_TEST_BRAND_ID: brand,
    CHAT_TEST_NSR_URL: url,
    CHAT_TEST_NSR_KEY: policyKey,
  };
  try {
    await run(environment, requests);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('preflight reports every missing setting without making requests', async () => {
  let calls = 0;
  const result = await computerChatPreflight(
    {},
    {
      fetchImpl() {
        calls++;
        throw new Error('Unexpected request');
      },
    }
  );
  assert.equal(result.ready_for_live_test, false);
  assert.equal(result.workflow_execution_verified, false);
  assert.equal(calls, 0);
  assert.equal(
    result.checks.filter((check) => check.key.startsWith('CHAT_TEST_') && check.status === 'fail')
      .length,
    6
  );
});

test('complete service declarations enable the live test, without executing a workflow', async () => {
  await fixture({}, async (environment, requests) => {
    const result = await computerChatPreflight(environment);
    assert.equal(result.ready_for_live_test, true);
    assert.equal(result.workflow_execution_verified, false);
    assert.deepEqual(
      requests.map(({ path, method }) => ({ path, method })),
      [
        { path: '/health', method: 'GET' },
        { path: '/v1/computer-chats/diagnostics', method: 'POST' },
        { path: '/api/v1/policy/computer/capabilities', method: 'GET' },
      ]
    );
    assert.equal(requests[1].auth, `Bearer ${engineKey}`);
    assert.equal(requests[1].tenant, tenant);
    assert.deepEqual(requests[1].body, { brand_id: brand, mcp_servers: [] });
    assert.equal(requests[2].auth, `Bearer ${policyKey}`);
    assert.equal(requests[2].tenant, undefined);
    assert(!JSON.stringify(result).includes(engineKey));
    assert(!JSON.stringify(result).includes(policyKey));
  });
});

test('a down Temporal namespace blocks acceptance even when connector checks pass', async () => {
  await fixture(
    {
      healthStatus: 503,
      health: { status: 'degraded', database: { ok: true }, temporal: { ok: false } },
    },
    async (environment) => {
      const result = await computerChatPreflight(environment);
      assert.equal(result.ready_for_live_test, false);
      assert.equal(result.checks.find((c) => c.key === 'engine_temporal').status, 'fail');
      assert.equal(result.checks.find((c) => c.key === 'engine_capabilities').status, 'pass');
    }
  );
});

test('an engine with its control plane disabled cannot be ready for computer chats', async () => {
  await fixture(
    {
      health: {
        status: 'ok',
        database: { ok: true, note: 'control-plane disabled' },
        temporal: { ok: true },
      },
    },
    async (environment) => {
      const result = await computerChatPreflight(environment);
      assert.equal(result.ready_for_live_test, false);
      assert.equal(result.checks.find((c) => c.key === 'engine_database').status, 'fail');
    }
  );
});

for (const missing of requiredChecks) {
  test(`preflight refuses readiness without ${missing}`, async () => {
    const report = ready();
    report.checks = report.checks.filter((c) => c.key !== missing);
    await fixture({ report }, async (environment) => {
      assert.equal((await computerChatPreflight(environment)).ready_for_live_test, false);
    });
  });
}

test('contradictory duplicate checks cannot establish readiness', async () => {
  const report = ready();
  report.checks.push({ key: 'sandbox', status: 'fail', message: engineKey });
  await fixture({ report }, async (environment) => {
    const result = await computerChatPreflight(environment);
    assert.equal(result.ready_for_live_test, false);
    assert(!JSON.stringify(result).includes(engineKey));
  });
});

test('direct policy access must expose the computer evidence contract', async () => {
  await fixture(
    { policy: { version: 1, organization_id: tenant, criteria: [] } },
    async (environment) => {
      assert.equal((await computerChatPreflight(environment)).ready_for_live_test, false);
    }
  );
});

test('read-only authentication fallback does not expose credentials', async () => {
  await fixture({ apiKeyOnly: true }, async (environment, requests) => {
    const result = await computerChatPreflight(environment);
    assert.equal(result.ready_for_live_test, true);
    assert.equal(requests.length, 6);
    assert.equal(requests[3].auth, `ApiKey ${engineKey}`);
    assert(!JSON.stringify(result).includes(engineKey));
  });
});

test('preflight refuses redirects without forwarding credentials', async () => {
  await fixture({ redirect: true }, async (environment, requests) => {
    assert.equal((await computerChatPreflight(environment)).ready_for_live_test, false);
    assert(!requests.some((r) => r.path === '/must-not-follow'));
  });
});

for (const option of ['oversized', 'invalidJson', 'hang']) {
  test(`a ${option} health response fails safely`, async () => {
    await fixture({ [option]: true }, async (environment) => {
      const result = await computerChatPreflight(environment, {
        timeoutMs: option === 'hang' ? 100 : 2000,
      });
      assert.equal(result.ready_for_live_test, false);
      assert.equal(result.checks.find((c) => c.key === 'engine_health').status, 'fail');
    });
  });
}

for (const url of [
  'http://remote.example',
  'https://user:credential@example.com',
  'https://example.com/?key=credential',
]) {
  test('unsafe engine addresses never receive credentials', async () => {
    let calls = 0;
    const result = await computerChatPreflight(
      { CHAT_TEST_ENGINE_URL: url, CHAT_TEST_ENGINE_KEY: engineKey },
      {
        fetchImpl() {
          calls++;
          throw new Error('Unexpected request');
        },
      }
    );
    assert.equal(result.ready_for_live_test, false);
    assert.equal(calls, 0);
    assert(!JSON.stringify(result).includes('credential'));
    assert(!JSON.stringify(result).includes(engineKey));
  });
}

test('an explicit env file is parsed without shell execution or inherited credential mixing', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'desktop-preflight-'));
  try {
    const filename = join(folder, 'test.env');
    await writeFile(filename, 'CHAT_TEST_ENGINE_KEY=$(do-not-execute)\n', { mode: 0o600 });
    const script = fileURLToPath(new URL('./computer-chat-preflight.mjs', import.meta.url));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--env-file', filename], {
        env: { ...process.env, CHAT_TEST_TENANT_ID: tenant, CHAT_TEST_BRAND_ID: brand },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.checks.find((c) => c.key === 'CHAT_TEST_TENANT_ID').status, 'fail');
    assert(!result.stdout.includes('do-not-execute'));
    assert.equal(result.stderr, '');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
