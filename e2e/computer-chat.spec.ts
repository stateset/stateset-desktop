import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect, requireDesktopDisplay } from './desktop';
import { DEFAULT_CHAT_CONFIGURATION } from '../src/features/computer-chat/durableTypes';
import type { DurableChatStatus } from '../src/features/computer-chat/durableTypes';

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Native test',
  slug: 'native',
  tier: 'pro',
};
const brand = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: tenant.id,
  name: 'Native brand',
  slug: 'native',
  enabled: true,
};
const engineKey = 'e2e-native-workflow-key';

/** A local contract fixture: networking and IPC are real; workflow execution is simulated. */
async function startEngine() {
  const requests: {
    path: string;
    method: string;
    body: any;
    tenant: string | undefined;
    authorization: string | undefined;
  }[] = [];
  const states = new Map<string, DurableChatStatus>();
  const receipts = new Map<string, { id: string; content: string }>();
  let dropAcknowledgement = true;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    const path = request.url ?? '';
    requests.push({
      path,
      method: request.method ?? '',
      body,
      tenant: request.headers['x-tenant-id'] as string | undefined,
      authorization: request.headers.authorization,
    });
    const reply = (value: unknown, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (
      request.headers.authorization !== `Bearer ${engineKey}` ||
      request.headers['x-tenant-id'] !== tenant.id
    ) {
      reply({ message: 'Fixture credentials or tenant were not forwarded' }, 401);
      return;
    }
    if (path === '/v1/computer-chats/diagnostics') {
      reply({
        version: 1,
        ready: true,
        checks: [{ key: 'engine', status: 'pass', message: 'Native bridge connected' }],
        mcp_servers: [],
      });
      return;
    }
    if (path === '/v1/computer-chats/start') {
      const workflowId = `computer-chat-${brand.id.replace(/-/g, '')}-${body.request_id.replace(/-/g, '')}`;
      if (!states.has(workflowId))
        states.set(workflowId, {
          version: 1,
          status: 'waiting_for_input',
          request_id: body.request_id,
          brand_id: body.brand_id,
          session: {
            id: `session-${body.request_id}`,
            organizationId: tenant.id,
            status: 'running',
            currentSandboxId: `sandbox-${body.request_id}`,
          },
          messages: [],
          events: [],
          last_event_id: 0,
          pending_action: null,
          artifacts: [],
          verification: null,
          workspace: null,
          screenshot: null,
          checkpoint: null,
          usage: {},
          budget: DEFAULT_CHAT_CONFIGURATION.budget,
          actions: 0,
          turns: 0,
          tokens: 0,
          paused: false,
          stop_requested: false,
          cleanup_verified: false,
          error: null,
          generation: 1,
        });
      reply({ workflow_id: workflowId, run_id: `run-${body.request_id}` });
      return;
    }
    const match = path.match(/^\/v1\/computer-chats\/([^/]+)\/(.+)$/);
    const state = match && states.get(match[1]);
    if (!state || !match) {
      reply({ message: 'Unknown fixture workflow' }, 404);
      return;
    }
    if (match[2] === 'status') {
      reply(state);
      return;
    }
    if (match[2] === 'messages') {
      // Retain the signal but hide its query confirmation until an explicit retry.
      // This makes the ambiguous acknowledgement scenario deterministic across restart.
      receipts.set(body.id, body);
      if (dropAcknowledgement) {
        dropAcknowledgement = false;
        reply({ message: 'Simulated lost acknowledgement' }, 503);
        return;
      }
      if (!state.messages.some((message) => message.id === body.id)) {
        state.messages.push({ ...receipts.get(body.id)!, role: 'user', timestamp: Date.now() });
      }
      reply({ accepted: true });
      return;
    }
    reply({ message: 'Unexpected fixture operation' }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    states,
    receipts,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function openChats(application: ElectronApplication): Promise<Page> {
  const page = await application.firstWindow();
  await page
    .context()
    .route('**/api/v1/**', (route) =>
      route.fulfill({ json: { ok: true, sessions: [], tenant, brands: [brand] } })
    );
  await page
    .context()
    .route('**/health/detailed', (route) => route.fulfill({ json: { status: 'healthy' } }));
  await page.context().addInitScript(
    ({ tenant, brand }) => {
      window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
    },
    { tenant, brand }
  );
  await page.waitForFunction(() => window.electronAPI?.store !== undefined);
  await page.evaluate(async () => {
    await window.electronAPI!.store.set('onboardingCompleted', true);
    await window.electronAPI!.store.set('theme', 'dark');
  });
  await page.reload();
  await page.getByRole('link', { name: 'Chats', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  return page;
}

async function savedChats(page: Page): Promise<any[]> {
  return page.evaluate(
    async () => ((await window.electronAPI!.store.get('computerChats')) as any[]) ?? []
  );
}

test.beforeAll(() => requireDesktopDisplay());

test('native chats survive restart with distinct computers and no automatic signal replay', async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  const engine = await startEngine();
  try {
    const profile = await desktop.createProfile();
    let application = await desktop.launch(profile);
    let page = await openChats(application);
    const secureStorage = await page.evaluate(() =>
      window.electronAPI!.auth.isSecureStorageAvailable()
    );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Workflow engine URL').fill(engine.url);
    await page.getByLabel('Workflow API key').fill(engineKey);
    await page.getByRole('button', { name: 'Save connection and check' }).click();
    await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
    if (!secureStorage)
      await expect(page.getByText(/The API key lasts until you quit the app/)).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
    await page
      .getByRole('textbox', { name: 'Chat message' })
      .fill('A draft retained across desktop restarts');
    await expect
      .poll(async () => (await savedChats(page))[0]?.draft)
      .toBe('A draft retained across desktop restarts');
    const first = (await savedChats(page))[0];
    await page.getByRole('button', { name: 'New Chat', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
    const second = (await savedChats(page)).find((chat) => chat.id !== first.id);
    expect(second.durableSession.workflowId).not.toBe(first.durableSession.workflowId);
    expect(second.serverState.session.id).not.toBe(first.serverState.session.id);
    expect(second.serverState.session.currentSandboxId).not.toBe(
      first.serverState.session.currentSandboxId
    );
    await page
      .getByRole('textbox', { name: 'Chat message' })
      .fill('Keep one stable message identity');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByText('Simulated lost acknowledgement', { exact: false })).toBeVisible();
    const pending = (await savedChats(page)).find((chat) => chat.id === second.id).pendingMessage;
    expect(pending.id).toMatch(/^[a-f0-9-]{36}$/);
    const mutations = () =>
      engine.requests.filter(
        (request) => request.method === 'POST' && !request.path.endsWith('/diagnostics')
      );
    const beforeRestart = mutations();
    await application.close();
    const restartOffset = engine.requests.length;

    application = await desktop.launch(profile);
    page = await openChats(application);
    // Force an actual read from the main process after restart, not a renderer cache.
    expect(await page.evaluate(() => window.electronAPI!.auth.getDurableEngineApiKey())).toBe(
      secureStorage ? engineKey : undefined
    );
    expect(mutations()).toEqual(beforeRestart);
    if (!secureStorage) {
      await page.getByRole('button', { name: 'Open connection settings', exact: true }).click();
      await expect(page.getByText(/The API key lasts until you quit the app/)).toBeVisible();
      await page.getByLabel('Workflow API key').fill(engineKey);
      await page.getByRole('button', { name: 'Save connection and check' }).click();
      await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    }
    await expect
      .poll(
        () =>
          engine.requests.slice(restartOffset).filter((request) => request.path.endsWith('/status'))
            .length
      )
      .toBeGreaterThanOrEqual(2);
    expect(mutations()).toEqual(beforeRestart);
    expect((await savedChats(page)).find((chat) => chat.id === first.id).draft).toBe(first.draft);
    expect((await savedChats(page)).find((chat) => chat.id === second.id).pendingMessage).toEqual(
      pending
    );
    await expect(page.getByRole('button', { name: 'Resend safely' })).toBeVisible();
    await page.getByRole('button', { name: 'Resend safely' }).click();
    await expect(page.getByRole('button', { name: 'Resend safely' })).toHaveCount(0);
    const signals = engine.requests.filter((request) => request.path.endsWith('/messages'));
    expect(signals).toHaveLength(2);
    expect(signals[0].body).toEqual(signals[1].body);
    expect(engine.receipts.size).toBe(1);
    expect(engine.states.get(second.durableSession.workflowId)!.messages).toHaveLength(1);
    expect(engine.requests.filter((request) => request.path.endsWith('/start'))).toHaveLength(2);
    // Browser preflight/health traffic is separate from the authenticated chat API.
    const incorrectlyScoped = engine.requests
      .filter(
        (request) =>
          request.path.startsWith('/v1/computer-chats/') &&
          request.method !== 'OPTIONS' &&
          (request.tenant !== tenant.id || request.authorization !== `Bearer ${engineKey}`)
      )
      .map(({ path, method, tenant, authorization }) => ({
        path,
        method,
        tenant,
        scheme: authorization?.split(' ')[0],
      }));
    expect(incorrectlyScoped).toEqual([]);
    const composer = page.getByRole('button', { name: 'Send message', exact: true });
    const composerFits = () =>
      composer.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.bottom <= window.innerHeight + 1 && bounds.right <= window.innerWidth + 1;
      });
    await expect.poll(composerFits).toBe(true);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 760)
    );
    await expect.poll(composerFits).toBe(true);
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({ path: 'dist/verification/native-chat-recovery.png' });
    await application.close();
  } finally {
    await engine.close();
  }
});

test('native bridge validates requests and artifact bytes before saving a deliverable', async ({
  desktop,
}) => {
  const profile = await desktop.createProfile();
  const application = await desktop.launch(profile);
  const page = await application.firstWindow();
  await page.waitForFunction(() => window.electronAPI?.computerChat !== undefined);
  await expect(
    page.evaluate(
      (tenantId) =>
        window.electronAPI!.computerChat!.request({
          path: '/api/v1/secrets',
          method: 'GET',
          tenantId,
        }),
      tenant.id
    )
  ).rejects.toThrow('outside the allowed API');
  await expect(
    page.evaluate(() =>
      window.electronAPI!.computerChat!.request({
        path: '/v1/computer-chats/diagnostics',
        method: 'POST',
        tenantId: 'tenant\r\nx-injected: value',
      })
    )
  ).rejects.toThrow('outside the allowed API');

  const destination = path.join(profile.userData, 'deliverable.txt');
  await writeFile(destination, 'Existing deliverable');
  // Substitute only the native picker; decoding, IPC and the atomic file write remain real.
  await application.evaluate(({ dialog }, destination) => {
    (globalThis as any).__saveDialogCalls = 0;
    dialog.showSaveDialog = (async () => {
      (globalThis as any).__saveDialogCalls++;
      return { canceled: false, filePath: destination };
    }) as typeof dialog.showSaveDialog;
  }, destination);
  const bytes = Buffer.from('A collected deliverable\n');
  const artifact = {
    filename: 'deliverable.txt',
    contentBase64: bytes.toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  await expect(
    page.evaluate((artifact) => window.electronAPI!.computerChat!.saveArtifact(artifact), {
      ...artifact,
      sha256: '0'.repeat(64),
    })
  ).rejects.toThrow('do not match');
  expect(await application.evaluate(() => (globalThis as any).__saveDialogCalls)).toBe(0);
  expect(await readFile(destination, 'utf8')).toBe('Existing deliverable');
  expect(
    await page.evaluate(
      (artifact) => window.electronAPI!.computerChat!.saveArtifact(artifact),
      artifact
    )
  ).toBe(true);
  expect(await application.evaluate(() => (globalThis as any).__saveDialogCalls)).toBe(1);
  expect(await readFile(destination)).toEqual(bytes);
  if (process.platform !== 'win32') expect((await stat(destination)).mode & 0o777).toBe(0o600);
  await application.close();
});
