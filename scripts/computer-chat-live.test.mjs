import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const brand = 'a2222222-b222-4222-8222-222222222222';
const tenant = '11111111-1111-4111-8111-111111111111';
const fixtureKey = 'local-harness-fixture-key';
const foreignWorkflow = 'computer-chat-unrelated-workflow';
const script = fileURLToPath(new URL('./computer-chat-live.mjs', import.meta.url));

async function runHarness(environment, { forbidNetwork = false } = {}) {
  const args = forbidNetwork
    ? [
        '--import',
        `data:text/javascript,${encodeURIComponent(
          'globalThis.fetch = () => { throw new Error("Unexpected harness network access"); };'
        )}`,
        script,
      ]
    : [script];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      timeout: 15000,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk).slice(-50000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-50000);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  assert.equal(result.signal, null, 'Fixture process must exit without a timeout');
  assert.notEqual(result.code, 0, 'A failed start must never report acceptance success');
  assert(!result.stdout.includes('"passed": true'));
  assert(!result.stderr.includes(fixtureKey), 'Errors must not expose credentials');
  return result;
}

async function failedStart({
  mode = 'http-error',
  stopFails = false,
  delayed = false,
  foreignReceipt = false,
  brandValue = brand,
} = {}) {
  const requests = [];
  let owned;
  let requestId;
  let statusReads = 0;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ path: request.url, method: request.method, body });
    const reply = (value, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (
      request.headers.authorization !== `Bearer ${fixtureKey}` ||
      request.headers['x-tenant-id'] !== tenant
    ) {
      reply({ message: 'Unexpected fixture credentials' }, 401);
      return;
    }
    if (request.url === '/v1/computer-chats/diagnostics') {
      reply({ ready: true, checks: [] });
      return;
    }
    if (request.url === '/v1/computer-chats/start') {
      requestId = body.request_id;
      owned = `computer-chat-${brand.replaceAll('-', '')}-${requestId.replaceAll('-', '')}`;
      if (mode === 'lost-response') request.socket.destroy();
      else if (mode === 'wrong-identity')
        reply({ workflow_id: foreignWorkflow, run_id: 'fixture-run' });
      else reply({ message: 'Start accepted but acknowledgement unavailable' }, 503);
      return;
    }
    if (request.url === `/v1/computer-chats/${owned}/control/stop`) {
      reply({ accepted: !stopFails }, stopFails ? 503 : 200);
      return;
    }
    if (request.url === `/v1/computer-chats/${owned}/status`) {
      statusReads++;
      const done = !delayed || statusReads > 1;
      reply({
        request_id: foreignReceipt ? 'different-request' : requestId,
        brand_id: brand,
        status: done ? 'stopped' : 'stopping',
        cleanup_verified: done,
        error: 'A previous action failed',
      });
      return;
    }
    reply({ message: 'Unknown fixture operation' }, 404);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await runHarness({
      CHAT_TEST_ENGINE_URL: endpoint,
      CHAT_TEST_ENGINE_KEY: fixtureKey,
      CHAT_TEST_TENANT_ID: tenant,
      CHAT_TEST_BRAND_ID: brandValue,
      CHAT_TEST_NSR_URL: endpoint,
      CHAT_TEST_NSR_KEY: fixtureKey,
      CHAT_TEST_MODEL: 'fixture-model',
    });
    return { ...result, requests, owned, requestId, statusReads };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

for (const mode of ['lost-response', 'http-error']) {
  test(`stops its deterministic workflow after ${mode}`, async () => {
    const result = await failedStart({ mode });
    const stops = result.requests.filter((request) => request.path.endsWith('/control/stop'));
    assert.deepEqual(
      stops.map((request) => request.path),
      [`/v1/computer-chats/${result.owned}/control/stop`]
    );
    assert.equal(result.statusReads, 1, 'Stop acknowledgement alone does not confirm cleanup');
    assert(!result.stderr.includes('"cleanup_confirmed":false'));
    assert(result.stderr.includes('"cleanup_confirmed":true'));
  });
}

test('does not stop a foreign workflow returned in a malformed start acknowledgement', async () => {
  const result = await failedStart({ mode: 'wrong-identity' });
  const stops = result.requests.filter((request) => request.path.endsWith('/control/stop'));
  assert.deepEqual(
    stops.map((request) => request.path),
    [`/v1/computer-chats/${result.owned}/control/stop`]
  );
  assert(!result.requests.some((request) => request.path.includes(foreignWorkflow)));
  assert.equal(result.statusReads, 1);
});

test('waits for confirmed cleanup even when the workflow retains an earlier action error', async () => {
  const result = await failedStart({ delayed: true });
  assert.equal(result.statusReads, 2);
  assert(!result.stderr.includes('"cleanup_confirmed":false'));
});

test('reports the owned workflow when its stop request fails', async () => {
  const result = await failedStart({ stopFails: true });
  assert(result.stderr.includes('"cleanup_confirmed":false'));
  assert(result.stderr.includes(result.owned));
  assert.equal(result.statusReads, 0);
});

test('refuses a cleanup receipt belonging to a different request', async () => {
  const result = await failedStart({ foreignReceipt: true });
  assert.equal(result.statusReads, 1);
  assert(result.stderr.includes('"cleanup_confirmed":false'));
});

test('normalizes the configured brand before deriving its cleanup identity', async () => {
  const result = await failedStart({ brandValue: brand.toUpperCase() });
  assert.equal(result.statusReads, 1);
  assert(result.stderr.includes('"cleanup_confirmed":true'));
  assert(
    result.requests.some(
      (request) => request.path === `/v1/computer-chats/${result.owned}/control/stop`
    )
  );
});

test('rejects an invalid workspace identifier before making requests or logging its value', async () => {
  const invalidValue = 'sensitive-value-in-the-wrong-setting';
  // Guard this child directly. Other workstation processes can probe an open
  // fixture port, so server traffic cannot prove which process made a request.
  const result = await runHarness(
    {
      CHAT_TEST_ENGINE_URL: 'http://127.0.0.1:1',
      CHAT_TEST_ENGINE_KEY: fixtureKey,
      CHAT_TEST_TENANT_ID: tenant,
      CHAT_TEST_BRAND_ID: invalidValue,
      CHAT_TEST_NSR_URL: 'http://127.0.0.1:1',
      CHAT_TEST_NSR_KEY: fixtureKey,
    },
    { forbidNetwork: true }
  );
  assert(result.stderr.includes('CHAT_TEST_BRAND_ID must be a UUID'));
  assert(!result.stderr.includes('Unexpected harness network access'));
  assert(!result.stderr.includes(invalidValue));
});
