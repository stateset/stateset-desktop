#!/usr/bin/env node
// Real APIs only. This command fails when credentials/services are missing.
import assert from 'node:assert/strict';
import { inspectComputerSetupReport } from './computer-chat-preflight.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}; see docs/COMPUTER_CHATS.md`);
  return value;
};
const identity = (name) => {
  const value = required(name);
  assert(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value), `${name} must be a UUID`);
  return value.toLowerCase();
};
const origin = (value) => {
  const url = new URL(value);
  assert(!url.username && !url.password && !url.search && !url.hash);
  assert(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
  return value.replace(/\/+$/, '');
};
const engine = origin(required('CHAT_TEST_ENGINE_URL'));
const key = required('CHAT_TEST_ENGINE_KEY');
const tenant = identity('CHAT_TEST_TENANT_ID');
const brand = identity('CHAT_TEST_BRAND_ID');
const nsr = origin(required('CHAT_TEST_NSR_URL'));
const nsrKey = required('CHAT_TEST_NSR_KEY');
const api = async (base, token, path, body, expectOk = true, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  let response;
  for (const scheme of ['Bearer', 'ApiKey']) {
    response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      headers: {
        Authorization: `${scheme} ${token}`,
        'x-tenant-id': tenant,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status !== 401 || scheme === 'ApiKey') break;
  }
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path}: non-JSON HTTP ${response.status}`);
  }
  if (expectOk) assert(response.ok, `${path}: HTTP ${response.status}`);
  return { status: response.status, result };
};
const call = async (path, body, timeoutMs) =>
  (await api(engine, key, path, body, true, timeoutMs)).result;
const diagnostics = await call('/v1/computer-chats/diagnostics', { brand_id: brand });
assert(
  inspectComputerSetupReport(diagnostics).ready,
  'Computer service readiness is incomplete; run doctor:computer-chat before live acceptance.'
);
const id = randomUUID(),
  marker = randomUUID(),
  messageId = randomUUID();
const start = {
  request_id: id,
  brand_id: brand,
  model: process.env.CHAT_TEST_MODEL || 'claude-sonnet-4-6',
  budget: { max_cost_cents: 200, max_tokens: 60000, max_actions: 12, max_runtime_seconds: 600 },
  permissions: {
    allowed_executables: ['python3'],
    allow_gui: false,
    require_action_approval: true,
  },
  criteria: [{ path: '/workspace/proof.json', kind: 'json', pointer: '/marker', expected: marker }],
  mcp_servers: [],
};
// Retain the owned identity before sending: an accepted request can lose its
// acknowledgement, and an invalid returned ID must never become a cleanup target.
const workflow = `computer-chat-${brand.replaceAll('-', '')}-${id.replaceAll('-', '')}`;
let cleanupConfirmed = false;
const stopAndConfirm = async () => {
  const deadline = Date.now() + 60000;
  const remaining = () => Math.max(1, deadline - Date.now());
  await call(`/v1/computer-chats/${workflow}/control/stop`, {}, remaining());
  while (Date.now() < deadline) {
    const state = await call(`/v1/computer-chats/${workflow}/status`, undefined, remaining());
    assert.equal(state.request_id, id);
    assert.equal(state.brand_id, brand);
    // An earlier action error must not prevent checking shutdown evidence.
    if (state.cleanup_verified === true) {
      assert.equal(state.status, 'stopped');
      return;
    }
    await delay(Math.min(1000, remaining()));
  }
  throw new Error('Timed out confirming test computer cleanup');
};
try {
  const first = await call('/v1/computer-chats/start', start);
  assert.equal(first.workflow_id, workflow);
  // Deliberately discard the first acknowledgement and retry identical input.
  const repeated = await call('/v1/computer-chats/start', start);
  assert.equal(repeated.workflow_id, workflow);
  assert.equal(repeated.run_id, first.run_id);
  const path = (suffix) => `/v1/computer-chats/${workflow}/${suffix}`;
  const until = async (predicate) => {
    const deadline = Date.now() + 540000;
    while (Date.now() < deadline) {
      const state = await call(path('status'));
      assert.equal(state.request_id, id);
      assert.equal(state.brand_id, brand);
      assert(!state.error, `Workflow needs attention: ${state.error}`);
      if (await predicate(state)) return state;
      await delay(1000);
    }
    throw new Error('Timed out waiting for durable conversation');
  };
  await until((s) => s.session?.status === 'running');
  const message = {
    id: messageId,
    content: `Use python3 to create /workspace/proof.json containing exactly the JSON object ${JSON.stringify({ marker })}. Publish it with publish_artifact, then finish. Do not create any other files or use external services.`,
  };
  await call(path('messages'), message);
  await call(path('messages'), message);
  let approvalCount = 0;
  const reviewed = new Set();
  const result = await until(async (state) => {
    if (state.status === 'awaiting_approval' && !reviewed.has(state.pending_action.request_id)) {
      const pending = state.pending_action,
        hash = pending.admission.evaluation.canonical_action_hash;
      assert.equal(
        pending.admission.final_verdict,
        'allow',
        'This fixture requires an allow policy plus explicit user review'
      );
      // A mismatched action ID must leave the real action waiting.
      await call(path('review'), {
        request_id: 'wrong-action',
        action_hash: hash,
        approved: true,
        accept_rewrite: false,
      });
      await delay(1500);
      const unchanged = await call(path('status'));
      assert.equal(unchanged.pending_action?.request_id, pending.request_id);
      assert.equal(unchanged.pending_action?.result_available, false);
      await call(path('review'), {
        request_id: pending.request_id,
        action_hash: hash,
        approved: true,
        accept_rewrite: false,
      });
      reviewed.add(pending.request_id);
      approvalCount++;
      // No desktop/status polling for five seconds: the worker owns progress.
      await delay(5000);
    }
    return state.verification?.outcome === 'verified';
  });
  assert(approvalCount >= 2, 'Execution and artifact publication must each require approval');
  assert.equal(result.messages.filter((m) => m.id === messageId).length, 1);
  const artifact = await call(path('artifact'), { path: '/workspace/proof.json' });
  const bytes = Buffer.from(artifact.content_base64, 'base64');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  assert.equal(JSON.parse(bytes).marker, marker);
  const evidence = {
    org_id: result.session.organizationId,
    session_id: result.session.id,
    request_id: randomUUID(),
    artifacts: [
      {
        path: artifact.path,
        sha256: artifact.sha256,
        content_base64: artifact.content_base64,
        media_type: artifact.media_type,
      },
    ],
    criteria: start.criteria,
  };
  const verified = await api(nsr, nsrKey, '/api/v1/policy/computer/verify', evidence);
  assert.equal(verified.result.outcome, 'verified');
  const corrupted = structuredClone(evidence);
  corrupted.artifacts[0].content_base64 = Buffer.from('tampered').toString('base64');
  assert.equal(
    (await api(nsr, nsrKey, '/api/v1/policy/computer/verify', corrupted, false)).status,
    400
  );
  const crossOrg = { ...evidence, org_id: randomUUID() };
  assert.equal(
    (await api(nsr, nsrKey, '/api/v1/policy/computer/verify', crossOrg, false)).status,
    403
  );
  await stopAndConfirm();
  cleanupConfirmed = true;
  console.log(
    JSON.stringify(
      {
        passed: true,
        workflow_id: workflow,
        session_id: result.session.id,
        approvals: approvalCount,
        checks: [
          'duplicate-start',
          'duplicate-message',
          'bound-approval',
          'server-progress',
          'artifact-digest',
          'acceptance',
          'tamper-rejection',
          'organization-isolation',
          'confirmed-cleanup',
        ],
      },
      null,
      2
    )
  );
} finally {
  if (!cleanupConfirmed) {
    try {
      await stopAndConfirm();
      console.error(
        JSON.stringify({ passed: false, cleanup_confirmed: true, workflow_id: workflow })
      );
    } catch {
      console.error(
        JSON.stringify({
          passed: false,
          cleanup_confirmed: false,
          workflow_id: workflow,
          message: 'Test computer cleanup is unconfirmed. Inspect this workflow before rerunning.',
        })
      );
    }
  }
}
