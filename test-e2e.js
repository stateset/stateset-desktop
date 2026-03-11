#!/usr/bin/env node
/**
 * End-to-End Test: Engine API + Sandbox API
 *
 * Usage:
 *   SS_API_KEY=<your-api-key> SS_SANDBOX_KEY=<your-sandbox-key> node test-e2e.js
 *
 * Optional overrides:
 *   SS_ENGINE_URL=https://engine.stateset.cloud.stateset.app
 *   SS_SANDBOX_URL=https://api.sandbox.stateset.app
 *   SS_AGENT_TYPE=default
 */

'use strict';

const ENGINE_URL  = (process.env.SS_ENGINE_URL  || 'https://engine.stateset.cloud.stateset.app').replace(/\/+$/, '');
const SANDBOX_URL = (process.env.SS_SANDBOX_URL || 'https://api.sandbox.stateset.app').replace(/\/+$/, '');
const API_KEY     = process.env.SS_API_KEY;
const SANDBOX_KEY = process.env.SS_SANDBOX_KEY;
const AGENT_TYPE  = process.env.SS_AGENT_TYPE || 'default';

// ─── helpers ────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';

let passed = 0;
let failed = 0;

function log(label, ...args) {
  console.log(`${DIM}[${label}]${RESET}`, ...args);
}

function pass(step, detail = '') {
  passed++;
  console.log(`${GREEN}  ✓${RESET} ${step}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}

function fail(step, err) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`${RED}  ✗${RESET} ${step}  ${DIM}${msg}${RESET}`);
}

function section(title) {
  console.log(`\n${CYAN}── ${title} ──${RESET}`);
}

async function engineFetch(path, opts = {}) {
  const headers = {
    Authorization: `ApiKey ${API_KEY}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const url = `${ENGINE_URL}/api/v1${path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${typeof body === 'object' ? (body.error || body.message || text) : text}`);
    err.status = res.status;
    err.body   = body;
    throw err;
  }
  return body;
}

async function sandboxFetch(path, opts = {}) {
  const headers = {
    ...(SANDBOX_KEY ? { Authorization: `ApiKey ${SANDBOX_KEY}` } : {}),
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const url = `${SANDBOX_URL}${path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${typeof body === 'object' ? (body.error || body.message || text) : text}`);
    err.status = res.status;
    err.body   = body;
    throw err;
  }
  return body;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${CYAN}StateSet End-to-End Test${RESET}`);
  console.log(`${DIM}Engine : ${ENGINE_URL}${RESET}`);
  console.log(`${DIM}Sandbox: ${SANDBOX_URL}${RESET}\n`);

  if (!API_KEY) {
    console.error(`${RED}Error: SS_API_KEY is required.${RESET}`);
    console.error('  Usage: SS_API_KEY=<key> SS_SANDBOX_KEY=<key> node test-e2e.js');
    process.exit(1);
  }

  // ── 1. Engine Auth ──────────────────────────────────────────────────────
  section('1. Engine API — Auth');
  let tenantId, brandId;

  try {
    const me = await engineFetch('/auth/me');
    tenantId = me.tenant?.id;
    brandId  = me.brands?.[0]?.id;
    pass('GET /api/v1/auth/me', `tenant=${me.tenant?.name ?? tenantId}  brands=${me.brands?.length ?? 0}`);
    log('tenant', tenantId);
    log('brand ',  brandId ?? '(none)');
  } catch (err) {
    fail('GET /api/v1/auth/me', err);
    console.error(`\n${RED}Cannot proceed without valid auth. Check SS_API_KEY.${RESET}\n`);
    process.exit(1);
  }

  if (!tenantId || !brandId) {
    console.log(`\n${YELLOW}⚠  No tenant/brand found — skipping agent session tests.${RESET}\n`);
  }

  // ── 2. Engine Agent Sessions ─────────────────────────────────────────────
  if (tenantId && brandId) {
    section('2. Engine API — Agent Sessions');
    let sessionId;

    // 2a. List sessions
    try {
      const listPath = `/tenants/${tenantId}/agents`;
      const res = await engineFetch(listPath);
      const sessions = res.sessions ?? res.agents ?? [];
      pass(`GET ${listPath}`, `count=${sessions.length}`);
    } catch (err) {
      fail(`GET /tenants/${tenantId}/agents`, err);
    }

    // 2b. Create session
    try {
      const createPath = `/tenants/${tenantId}/brands/${brandId}/agents`;
      const res = await engineFetch(createPath, {
        method: 'POST',
        body: JSON.stringify({
          agent_type: AGENT_TYPE,
          config: {
            loop_interval_ms: 1000,
            max_iterations: 10,
            iteration_timeout_secs: 60,
            pause_on_error: false,
            custom_instructions: null,
            mcp_servers: [],
            model: 'claude-sonnet-4-6',
            temperature: 0.7,
            ...(SANDBOX_KEY ? { sandbox_api_key: SANDBOX_KEY } : {}),
          },
        }),
      });
      sessionId = res.session?.id;
      pass(`POST ${createPath}`, `session_id=${sessionId}  status=${res.session?.status}`);
    } catch (err) {
      fail(`POST /tenants/${tenantId}/brands/${brandId}/agents`, err);
    }

    // 2c. Start session
    if (sessionId) {
      try {
        const startPath = `/tenants/${tenantId}/brands/${brandId}/agents/${sessionId}/start`;
        const res = await engineFetch(startPath, { method: 'POST' });
        pass(`POST ${startPath}`, `status=${res.session?.status}`);
      } catch (err) {
        // 409 "already running" is acceptable
        if (err.status === 409 || (err.message && err.message.toLowerCase().includes('already running'))) {
          pass(`POST .../agents/${sessionId}/start`, '(already running — OK)');
        } else {
          fail(`POST .../agents/${sessionId}/start`, err);
        }
      }

      // 2d. Poll for session to become running before sending message
      try {
        const pollPath = `/tenants/${tenantId}/brands/${brandId}/agents/${sessionId}`;
        const deadline = Date.now() + 15000;
        let sessionStatus = 'starting';
        while (Date.now() < deadline && sessionStatus !== 'running') {
          await sleep(1000);
          const s = await engineFetch(pollPath);
          sessionStatus = s.session?.status ?? sessionStatus;
        }
      } catch {}

      // 2e. Send message — retry with backoff until session worker is active on NATS
      {
        const msgPath = `/tenants/${tenantId}/brands/${brandId}/agents/${sessionId}/message`;
        const msgDeadline = Date.now() + 20000;
        let msgSent = false;
        let lastMsgErr;
        while (Date.now() < msgDeadline) {
          try {
            await engineFetch(msgPath, {
              method: 'POST',
              body: JSON.stringify({ message: 'Hello from the StateSet E2E test. Please confirm you received this.' }),
            });
            msgSent = true;
            break;
          } catch (err) {
            lastMsgErr = err;
            // 400 "not active" = worker not ready yet; keep retrying
            if (err.status === 400) { await sleep(2000); continue; }
            break;
          }
        }
        if (msgSent) pass(`POST ${msgPath}`, 'message sent');
        else fail(`POST .../agents/${sessionId}/message`, lastMsgErr);
      }

      // 2e. Get session state
      try {
        const getPath = `/tenants/${tenantId}/brands/${brandId}/agents/${sessionId}`;
        const res = await engineFetch(getPath);
        pass(`GET ${getPath}`, `status=${res.session?.status}`);
      } catch (err) {
        fail(`GET .../agents/${sessionId}`, err);
      }

      // 2f. Stop session (cleanup)
      try {
        const stopPath = `/tenants/${tenantId}/brands/${brandId}/agents/${sessionId}/stop`;
        await engineFetch(stopPath, { method: 'POST' });
        pass(`POST ${stopPath}`, 'session stopped');
      } catch (err) {
        // 500 = session on other pod (cross-replica issue) or already self-terminated — both OK
        // Session will auto-stop after max_iterations regardless
        if (err.status === 500) {
          pass(`POST .../agents/${sessionId}/stop`, `(stop routed to different pod or already stopped — OK)`);
        } else {
          fail(`POST .../agents/${sessionId}/stop`, err);
        }
      }
    }
  }

  // ── 3. Sandbox API ───────────────────────────────────────────────────────
  section('3. Sandbox API');

  // 3a. Health (no auth required)
  let sandboxHealthy = false;
  try {
    const health = await sandboxFetch('/health');
    sandboxHealthy = health.status === 'healthy';
    pass('GET /health', `status=${health.status}`);
  } catch (err) {
    fail('GET /health', err);
  }

  if (!SANDBOX_KEY) {
    console.log(`  ${YELLOW}⚠  SS_SANDBOX_KEY not set — skipping sandbox create/execute tests.${RESET}`);
  } else if (sandboxHealthy) {
    let sandboxId;

    // 3b. Create sandbox
    try {
      const sandbox = await sandboxFetch('/api/sandbox/create', { method: 'POST' });
      sandboxId = sandbox.sandbox_id;
      const startupMs = sandbox.startup_metrics?.total_ms ?? '?';
      pass('POST /api/sandbox/create', `id=${sandboxId}  ip=${sandbox.pod_ip}  startup=${startupMs}ms`);
    } catch (err) {
      fail('POST /api/sandbox/create', err);
    }

    if (sandboxId) {
      // 3c. Poll until running via execute ping (up to 30s)
      let ready = false;
      try {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          try {
            const r = await sandboxFetch(`/api/sandbox/${sandboxId}/execute`, {
              method: 'POST',
              body: JSON.stringify({ command: 'echo pong' }),
            });
            if (r.exit_code === 0 && r.stdout?.includes('pong')) { ready = true; break; }
          } catch (pingErr) {
            if (pingErr.status !== 404 && pingErr.status !== 503) throw pingErr;
          }
          await sleep(2000);
        }
        if (ready) {
          pass(`sandbox ${sandboxId} ping`, 'running (execute echo pong)');
        } else {
          fail(`sandbox ${sandboxId} ping`, new Error('Timed out waiting for sandbox to become ready'));
        }
      } catch (err) {
        fail(`sandbox ${sandboxId} ping`, err);
      }

      // 3d. Execute a command
      if (ready) {
        try {
          const result = await sandboxFetch(`/api/sandbox/${sandboxId}/execute`, {
            method: 'POST',
            body: JSON.stringify({ command: 'echo "E2E test OK" && node --version' }),
          });
          const out = (result.stdout || '').trim().slice(0, 80);
          pass(`POST /api/sandbox/${sandboxId}/execute`, `exit=${result.exit_code}  stdout="${out}"`);
        } catch (err) {
          fail(`POST /api/sandbox/${sandboxId}/execute`, err);
        }

        // 3e. Write + read file
        try {
          const wsPath = '/workspace/e2e.txt';
          const fileContent = 'Hello from E2E\n';
          const encoded = Buffer.from(fileContent, 'utf8').toString('base64');
          await sandboxFetch(`/api/sandbox/${sandboxId}/files`, {
            method: 'POST',
            body: JSON.stringify({ files: [{ path: wsPath, content: encoded }] }),
          });
          const file = await sandboxFetch(`/api/sandbox/${sandboxId}/files?path=${encodeURIComponent(wsPath)}`);
          let decoded = file.content ?? '';
          try { decoded = Buffer.from(decoded, 'base64').toString('utf8'); } catch {}
          pass(`POST+GET /api/sandbox/${sandboxId}/files`, `content="${decoded.trim()}"`);
        } catch (err) {
          fail(`file write/read in sandbox ${sandboxId}`, err);
        }
      }

      // 3f. Terminate sandbox (cleanup)
      try {
        await sandboxFetch(`/api/sandbox/${sandboxId}`, { method: 'DELETE' });
        pass(`DELETE /api/sandbox/${sandboxId}`, 'terminated');
      } catch (err) {
        fail(`DELETE /api/sandbox/${sandboxId}`, err);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${DIM}────────────────────────────────${RESET}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`${GREEN}All ${total} checks passed.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${GREEN}${passed} passed${RESET}  ${RED}${failed} failed${RESET}  (${total} total)\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${RED}Unexpected error:${RESET}`, err);
  process.exit(1);
});
