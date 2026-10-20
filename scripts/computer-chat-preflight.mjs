#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import requiredChecks from '../src/features/computer-chat/setup-checks.json' with { type: 'json' };

const variables = [
  'CHAT_TEST_ENGINE_URL',
  'CHAT_TEST_ENGINE_KEY',
  'CHAT_TEST_TENANT_ID',
  'CHAT_TEST_BRAND_ID',
  'CHAT_TEST_NSR_URL',
  'CHAT_TEST_NSR_KEY',
];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const qualification =
  'Read-only connectivity and declared capability checks. No workflow, sandbox, inference or artifact verification is executed. Worker execution and service organization alignment must still pass the live acceptance harness.';

function validUrl(value) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export function inspectComputerSetupReport(report) {
  const entries = report?.checks;
  const tools = report?.mcp_servers;
  const wellFormed =
    report?.version === 1 &&
    typeof report.ready === 'boolean' &&
    Array.isArray(entries) &&
    entries.every(
      (check) =>
        typeof check?.key === 'string' &&
        ['pass', 'fail'].includes(check.status) &&
        typeof check.message === 'string'
    ) &&
    new Set(entries.map((check) => check.key)).size === entries.length &&
    Array.isArray(tools) &&
    tools.every((tool) => typeof tool?.key === 'string' && typeof tool.ready === 'boolean') &&
    new Set(tools.map((tool) => tool.key)).size === tools.length;
  return {
    wellFormed,
    ready:
      wellFormed &&
      report.ready === true &&
      entries.every((check) => check.status === 'pass') &&
      requiredChecks.every((key) => entries.some((check) => check.key === key)),
  };
}

async function jsonBody(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error('response_too_large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function request(base, key, tenant, path, body, fetchImpl, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  for (const scheme of key ? ['Bearer', 'ApiKey'] : [null]) {
    const response = await fetchImpl(base.replace(/\/+$/, '') + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal,
      headers: {
        ...(key ? { Authorization: `${scheme} ${key}` } : {}),
        ...(tenant ? { 'x-tenant-id': tenant } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && scheme === 'Bearer') {
      await response.body?.cancel();
      continue;
    }
    if (![200, 503].includes(response.status)) {
      await response.body?.cancel();
      return { status: response.status, body: null };
    }
    return { status: response.status, body: await jsonBody(response) };
  }
}

export async function computerChatPreflight(
  environment,
  { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}
) {
  const checks = [];
  const add = (key, status, message) => checks.push({ key, status, message });
  const valid = {};
  for (const name of variables) {
    const value = environment[name];
    const present = typeof value === 'string' && Boolean(value.trim());
    valid[name] =
      present &&
      (name.endsWith('_URL')
        ? validUrl(value)
        : name.endsWith('_ID')
          ? uuid.test(value)
          : !/[\x00-\x1f\x7f]/.test(value));
    add(
      name,
      valid[name] ? 'pass' : 'fail',
      valid[name]
        ? 'Configured.'
        : present
          ? 'Invalid configuration.'
          : 'Required configuration is missing.'
    );
  }
  const engineConfigured = variables.slice(0, 4).every((name) => valid[name]);
  if (valid.CHAT_TEST_ENGINE_URL) {
    try {
      const result = await request(
        environment.CHAT_TEST_ENGINE_URL,
        valid.CHAT_TEST_ENGINE_KEY ? environment.CHAT_TEST_ENGINE_KEY : null,
        valid.CHAT_TEST_TENANT_ID ? environment.CHAT_TEST_TENANT_ID : null,
        '/health',
        undefined,
        fetchImpl,
        timeoutMs
      );
      const health = result.body;
      add(
        'engine_health',
        result.status === 200 && health?.status === 'ok' ? 'pass' : 'fail',
        result.status === 401 || result.status === 403
          ? 'Engine authentication was rejected.'
          : 'Engine health must return HTTP 200 with status ok.'
      );
      add(
        'engine_database',
        health?.database?.ok === true && health.database.note !== 'control-plane disabled'
          ? 'pass'
          : 'fail',
        'An enabled, healthy control-plane database is required.'
      );
      add(
        'engine_temporal',
        health?.temporal?.ok === true ? 'pass' : 'fail',
        'The engine must confirm its Temporal namespace is reachable.'
      );
    } catch {
      add(
        'engine_health',
        'fail',
        'Engine health is unreachable, timed out, redirected or returned an invalid response.'
      );
    }
  } else {
    add('engine_health', 'blocked', 'Configure CHAT_TEST_ENGINE_URL to inspect the local engine.');
  }
  if (engineConfigured) {
    try {
      const result = await request(
        environment.CHAT_TEST_ENGINE_URL,
        environment.CHAT_TEST_ENGINE_KEY,
        environment.CHAT_TEST_TENANT_ID,
        '/v1/computer-chats/diagnostics',
        { brand_id: environment.CHAT_TEST_BRAND_ID.toLowerCase(), mcp_servers: [] },
        fetchImpl,
        timeoutMs
      );
      const report = result.body;
      const entries = report?.checks;
      const { wellFormed, ready: declaredReady } = inspectComputerSetupReport(report);
      const ready = result.status === 200 && declaredReady;
      add(
        'engine_capabilities',
        ready ? 'pass' : 'fail',
        ready
          ? 'The engine confirms all required computer capabilities.'
          : 'Engine capabilities are incomplete, unavailable or not ready.'
      );
      if (wellFormed) {
        for (const key of requiredChecks) {
          add(
            key,
            entries.find((check) => check.key === key)?.status === 'pass' ? 'pass' : 'fail',
            'Required engine capability: ' + key + '.'
          );
        }
      }
    } catch {
      add(
        'engine_capabilities',
        'fail',
        'Computer diagnostics are unreachable, timed out, redirected or invalid.'
      );
    }
  } else {
    add(
      'engine_capabilities',
      'blocked',
      'Configure engine URL/key and organization/brand UUIDs before checking connectors.'
    );
  }
  if (valid.CHAT_TEST_NSR_URL && valid.CHAT_TEST_NSR_KEY) {
    try {
      const result = await request(
        environment.CHAT_TEST_NSR_URL,
        environment.CHAT_TEST_NSR_KEY,
        null,
        '/api/v1/policy/computer/capabilities',
        undefined,
        fetchImpl,
        timeoutMs
      );
      const value = result.body;
      const ready =
        result.status === 200 &&
        value?.version === 1 &&
        typeof value.organization_id === 'string' &&
        value.organization_id.length > 0 &&
        Array.isArray(value.criteria) &&
        ['contains', 'equals', 'json', 'sha256', 'png'].every((kind) =>
          value.criteria.includes(kind)
        ) &&
        Number.isInteger(value.max_artifacts) &&
        value.max_artifacts >= 1 &&
        Number.isInteger(value.max_artifact_bytes) &&
        value.max_artifact_bytes >= 1;
      add(
        'policy_acceptance_access',
        ready ? 'pass' : 'fail',
        ready
          ? 'Direct policy capability access is available for the live test.'
          : 'Policy capability access is unavailable or incomplete.'
      );
    } catch {
      add(
        'policy_acceptance_access',
        'fail',
        'Policy capabilities are unreachable, timed out, redirected or invalid.'
      );
    }
  } else {
    add(
      'policy_acceptance_access',
      'blocked',
      'Configure the direct policy URL/key required by live acceptance.'
    );
  }
  return {
    schema_version: 1,
    ready_for_live_test: checks.every((check) => check.status === 'pass'),
    workflow_execution_verified: false,
    checks,
    next_step: 'Run npm run test:computer-chat:live through Buildr after preflight passes.',
    qualification,
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: npm run doctor:computer-chat [-- --env-file /approved/test.env]\nRead-only checks. Config files are parsed without executing shell code; an explicit file supplies all CHAT_TEST settings without mixing shell credentials.'
    );
    return;
  }
  let environment = process.env;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--env-file') throw new Error('invalid_arguments');
    if ((await stat(args[1])).size > 65536) throw new Error('configuration_too_large');
    environment = parseEnv(await readFile(args[1], 'utf8'));
  }
  const result = await computerChatPreflight(environment);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready_for_live_test ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    console.error(
      JSON.stringify({
        ready_for_live_test: false,
        workflow_execution_verified: false,
        error:
          'Unable to read the supplied configuration or arguments. Use --help; no configuration values are logged.',
      })
    );
    process.exitCode = 1;
  });
}
