import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, requireDesktopDisplay } from './desktop';
import { installDesktopApiFixture } from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import type {
  DurableWorkflowSchedule,
  TrackedDurableWorkflow,
} from '../src/stores/durableWorkflows';

test.beforeAll(() => requireDesktopDisplay());

test('packaged startup path opens without an environment key and preserves encrypted preferences', async ({
  desktop,
}) => {
  const profile = await desktop.createProfile({ packaged: true });
  let application = await desktop.launch(profile);
  let page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  expect(await application.evaluate(() => process.env.STORE_ENCRYPTION_KEY)).toBe('');
  await page.evaluate(() => window.electronAPI!.store.set('theme', 'light'));
  const keyPath = path.join(profile.userData, '.store-key');
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  const originalKey = digest(await readFile(keyPath));
  if (process.platform !== 'win32') expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  expect(
    (await readFile(path.join(profile.userData, 'stateset-config.json'))).includes(
      Buffer.from('"theme"')
    )
  ).toBe(false);
  await application.close();

  application = await desktop.launch(profile);
  page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  expect(digest(await readFile(keyPath))).toBe(originalKey);
  await application.close();
});

test('packaged startup path encrypts legacy JSON while retaining its settings', async ({
  desktop,
}) => {
  const profile = await desktop.createProfile({ packaged: true });
  const configuration = path.join(profile.userData, 'stateset-config.json');
  await writeFile(configuration, JSON.stringify({ theme: 'light', onboardingCompleted: true }));
  const application = await desktop.launch(profile);
  const page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  expect(await page.evaluate(() => window.electronAPI!.store.get('onboardingCompleted'))).toBe(
    true
  );
  expect((await readFile(configuration)).includes(Buffer.from('onboardingCompleted'))).toBe(false);
  if (process.platform !== 'win32') expect((await stat(configuration)).mode & 0o777).toBe(0o600);
  await application.close();
});

test('submitted scheduled runs recover after restart without resubmitting work', async ({
  desktop,
}) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Schedule recovery test',
    slug: 'schedule-recovery',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Recovery brand',
    slug: 'recovery',
    enabled: true,
  };
  const requestId = '33333333-3333-4333-8333-333333333333';
  const workflowId = `active-horizon-agent-${brand.id.replace(/-/g, '')}-${requestId.replace(/-/g, '')}`;
  const engineKey = 'native-scheduled-recovery-key';
  const goal = 'Review inventory without launching another occurrence';
  const requests: Array<{ method: string; path: string; tenant?: string; authorization?: string }> =
    [];
  const ambientRootProbes: Array<{ method: string; path: string }> = [];
  const primaryStyles: Record<string, unknown> = {};
  let confirmationAvailable = false;
  // The owned HTTP service preserves actual 404 responses in Electron; CDP
  // route.fulfill can expose an opaque status-0 response instead.
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Access-Control-Allow-Origin', DESKTOP_TEST_ORIGIN);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Tenant-ID');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    // Open fixture ports can receive unrelated workstation probes. Record only
    // this exact unauthenticated root read separately; every POST and every
    // workflow-path request remains in the strict recovery traffic assertions.
    if (
      request.method === 'GET' &&
      request.url === '/' &&
      request.headers.authorization === undefined &&
      request.headers['x-tenant-id'] === undefined
    ) {
      ambientRootProbes.push({ method: request.method, path: request.url });
      response.writeHead(404).end(JSON.stringify({ message: 'Not a workflow route' }));
      return;
    }
    requests.push({
      method: request.method ?? '',
      path: request.url ?? '',
      tenant: request.headers['x-tenant-id'] as string | undefined,
      authorization: request.headers.authorization,
    });
    if (
      request.headers.authorization !== `Bearer ${engineKey}` ||
      request.headers['x-tenant-id'] !== tenant.id
    ) {
      response
        .writeHead(401)
        .end(JSON.stringify({ message: 'Unexpected fixture credentials or tenant' }));
      return;
    }
    if (
      request.method !== 'GET' ||
      request.url !== `/v1/workflows/active-horizon-agent/${workflowId}/status`
    ) {
      response
        .writeHead(405)
        .end(JSON.stringify({ message: 'This fixture only confirms an existing run' }));
      return;
    }
    if (!confirmationAvailable) {
      response
        .writeHead(404)
        .end(JSON.stringify({ message: 'The scheduled run is not available yet.' }));
      return;
    }
    response.end(
      JSON.stringify({
        goal,
        status: 'completed',
        current_task_id: null,
        generation: 0,
        turns_completed: 1,
        failures: 0,
        elapsed_active_secs: 1,
        active_window_secs: 3600,
        max_turns: 1,
        tasks_remaining: 0,
        paused: false,
        cancelled: false,
        steering_notes: [],
      })
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const engineUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dueAt = new Date(Date.now() - 60_000).toISOString();
  const definition = {
    steps: [['python3 /workspace/review.py']],
    activeWindowSeconds: 3600,
    maxFailures: 3,
    perCommandTimeoutSeconds: 300,
    stepAgents: [null],
  };
  const schedule: DurableWorkflowSchedule = {
    id: 'schedule-native-recovery',
    name: 'Pending inventory review',
    tenantId: tenant.id,
    brandId: brand.id,
    goal,
    definition,
    frequency: 'daily',
    nextRunAt: dueAt,
    enabled: false,
    createdAt: dueAt,
    updatedAt: dueAt,
    pendingOccurrence: {
      requestId,
      workflowId,
      engineUrl,
      tenantId: tenant.id,
      brandId: brand.id,
      goal,
      definition,
      dueAt,
      claimedAt: dueAt,
      submitted: true,
      needsAttention: true,
    },
  };
  let application: ElectronApplication | undefined;
  try {
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    application = await desktop.launch(profile);
    let page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.evaluate(
      async ({ engineUrl, engineKey, schedule }) => {
        await window.electronAPI!.store.set('durableWorkflowEngineUrl', engineUrl);
        await window.electronAPI!.auth.setDurableEngineApiKey(engineKey);
        await window.electronAPI!.store.set('durableTrackedWorkflows', []);
        await window.electronAPI!.store.set('durableWorkflowSchedules', [schedule]);
        await window.electronAPI!.store.set('onboardingCompleted', true);
      },
      { engineUrl, engineKey, schedule }
    );
    await application.close();

    application = await desktop.launch(profile);
    page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    // This profile uses the app's actual memory-only credential fallback. Its
    // persisted occurrence survives restart; its key must be entered again.
    expect(
      await page.evaluate(() => window.electronAPI!.auth.getDurableEngineApiKey())
    ).toBeUndefined();
    await page.evaluate(
      (engineKey) => window.electronAPI!.auth.setDurableEngineApiKey(engineKey),
      engineKey
    );
    await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
      },
      { tenant, brand }
    );
    await page.reload();
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    const row = page.getByRole('group', { name: `Schedule ${schedule.name}`, exact: true });
    await expect(
      row.getByText('Launch confirmation needs attention', { exact: true })
    ).toBeVisible();
    await expect(row.getByRole('button', { name: 'Run now', exact: true })).toBeDisabled();
    await expect(
      row.getByRole('button', { name: `Delete ${schedule.name}`, exact: true })
    ).toBeDisabled();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1024, 768)
    );
    await mkdir('dist/verification', { recursive: true });
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((theme) => window.electronAPI!.store.set('theme', theme), theme);
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme);
      await expect(
        row.getByText('Launch confirmation needs attention', { exact: true })
      ).toBeVisible();
      await expect
        .poll(() =>
          row
            .getByText(schedule.name, { exact: true })
            .evaluate((element) => element.scrollWidth <= element.clientWidth)
        )
        .toBe(true);
      await expect
        .poll(() =>
          row.evaluate((element) => {
            const surface = getComputedStyle(document.documentElement).getPropertyValue(
              '--ui-surface'
            );
            const probe = document.createElement('div');
            probe.style.backgroundColor = surface;
            return (
              getComputedStyle(element.parentElement!).backgroundColor ===
              probe.style.backgroundColor
            );
          })
        )
        .toBe(true);
      const primary = page.getByRole('button', { name: 'New workflow', exact: true });
      await expect(primary).toBeEnabled();
      const readPrimaryStyle = () =>
        primary.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            text: element.textContent,
            color: style.color,
            textFillColor: style.webkitTextFillColor,
            background: style.backgroundColor,
            opacity: style.opacity,
            visibility: style.visibility,
          };
        });
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      const beforeScan = await readPrimaryStyle();
      await page.screenshot({
        path: `dist/verification/schedule-pending-${theme}.png`,
        animations: 'disabled',
      });
      expect(
        (
          await new AxeBuilder({ page })
            .setLegacyMode()
            .include(`[role="group"][aria-label="Schedule ${schedule.name}"]`)
            .include('.page-shell > header')
            .analyze()
        ).violations
      ).toEqual([]);
      primaryStyles[theme] = { beforeScan, afterScan: await readPrimaryStyle() };
    }
    expect(requests).toEqual([]);
    expect(
      await page.evaluate(() => window.electronAPI!.store.get('durableTrackedWorkflows'))
    ).toEqual([]);

    await row.getByRole('button', { name: 'Check pending run', exact: true }).click();
    await expect(row.getByText(/The scheduled run is not available yet\./)).toBeVisible();
    const savedSchedules = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get(
            'durableWorkflowSchedules'
          )) as DurableWorkflowSchedule[]
      );
    await expect.poll(savedSchedules).toEqual([
      expect.objectContaining({
        enabled: false,
        nextRunAt: dueAt,
        pendingOccurrence: expect.objectContaining({
          requestId,
          workflowId,
          submitted: true,
          needsAttention: true,
        }),
      }),
    ]);
    expect(requests.map(({ method }) => method)).toEqual(['GET']);

    confirmationAvailable = true;
    await row.getByRole('button', { name: 'Check pending run', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Check pending run', exact: true })).toHaveCount(
      0
    );
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
    await expect.poll(savedSchedules).toEqual([
      expect.objectContaining({
        enabled: false,
        lastWorkflowId: workflowId,
        lastRunAt: dueAt,
      }),
    ]);
    expect((await savedSchedules())[0].pendingOccurrence).toBeUndefined();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await window.electronAPI!.store.get(
              'durableTrackedWorkflows'
            )) as TrackedDurableWorkflow[]
        )
      )
      .toEqual([expect.objectContaining({ workflowId, requestId, status: 'completed', goal })]);
    expect(requests).toEqual(
      [1, 2].map(() => ({
        method: 'GET',
        path: `/v1/workflows/active-horizon-agent/${workflowId}/status`,
        tenant: tenant.id,
        authorization: `Bearer ${engineKey}`,
      }))
    );
    await test.info().attach('scheduled-recovery-requests', {
      body: Buffer.from(
        JSON.stringify({
          workflowRequests: requests.map(({ method, path }) => ({ method, path })),
          ambientRootProbes,
          primaryStyles,
        })
      ),
      contentType: 'application/json',
    });
  } finally {
    try {
      await application?.close();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  }
});
