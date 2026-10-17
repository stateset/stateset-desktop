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
  DurableWorkflowBlueprint,
  TrackedDurableWorkflow,
} from '../src/stores/durableWorkflows';
import type { DurableAgentProfile } from '../src/lib/durableAgentProfiles';

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
  const viewportLayouts: Record<string, unknown> = {};
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
        await window.electronAPI!.store.set('theme', 'dark');
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
    await mkdir('dist/verification', { recursive: true });
    for (const size of ['standard', 'minimum'] as const) {
      await application.evaluate(({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (size === 'standard') window.setContentSize(1024, 768);
        else {
          const [width, height] = window.getMinimumSize();
          window.setSize(width, height);
        }
      }, size);
      for (const theme of ['dark', 'light'] as const) {
        if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) {
          await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        }
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
        const layout = await page.locator('.page-shell > header').evaluate((element) => {
          const title = element.firstElementChild!.getBoundingClientRect();
          const actions = element.lastElementChild!.getBoundingClientRect();
          return {
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            stacked: actions.top >= title.bottom,
            viewportFits: document.documentElement.scrollWidth <= innerWidth,
            headerFits: element.scrollWidth <= element.clientWidth,
            buttons: Array.from(element.querySelectorAll('button')).map((button) => {
              const text = Array.from(button.childNodes).find(
                (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
              );
              const range = document.createRange();
              if (text) range.selectNodeContents(text);
              return {
                name: button.textContent?.trim(),
                lines: text ? range.getClientRects().length : 0,
                fits: button.scrollWidth <= button.clientWidth,
              };
            }),
          };
        });
        expect(layout.viewportFits).toBe(true);
        expect(layout.headerFits).toBe(true);
        if (layout.viewportWidth < 1280) expect(layout.stacked).toBe(true);
        expect(layout.buttons).toEqual(
          ['Agents', 'Track existing', 'New workflow'].map((name) => ({
            name,
            lines: 1,
            fits: true,
          }))
        );
        viewportLayouts[`${size}-${theme}`] = layout;
        const beforeScan = await readPrimaryStyle();
        await page.screenshot({
          path: `dist/verification/schedule-pending-${size === 'minimum' ? 'minimum-' : ''}${theme}.png`,
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
          viewportLayouts,
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

test('workflow blueprint imports survive restart and deletion preserves the working draft', async ({
  desktop,
}) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Blueprint workspace',
    slug: 'blueprint-workspace',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Blueprint brand',
    slug: 'blueprint-brand',
    enabled: true,
  };
  const openWorkspace = async (application: ElectronApplication) => {
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.evaluate(async () => {
      await window.electronAPI!.store.set('onboardingCompleted', true);
      await window.electronAPI!.auth.setDurableEngineApiKey('blueprint-fixture-key');
    });
    await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
      },
      { tenant, brand }
    );
    await page.reload();
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    return page;
  };
  const at = new Date().toISOString();
  const imported: DurableWorkflowBlueprint[] = ['Orders audit', 'Returns audit'].map(
    (name, index) => ({
      id: `blueprint-import-${index}`,
      name,
      goal: `Review ${name.toLowerCase()}`,
      definition: {
        steps: [[`audit-${index}`]],
        activeWindowSeconds: 3600,
        maxFailures: 3,
        perCommandTimeoutSeconds: 300,
      },
      createdAt: at,
      updatedAt: at,
    })
  );
  let application: ElectronApplication | undefined;
  try {
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    application = await desktop.launch(profile);
    let page = await openWorkspace(application);
    await page.getByRole('button', { name: 'New workflow', exact: true }).click();
    await page.getByLabel('Goal', { exact: true }).fill('Weekly inventory review');
    await page.getByLabel('Commands', { exact: true }).fill('collect-inventory\n\nverify-report');
    await page.getByText('Save as reusable blueprint', { exact: true }).click();
    await page.getByLabel('Blueprint name', { exact: true }).fill('Weekly inventory');
    await page.getByRole('button', { name: 'Save blueprint', exact: true }).click();
    await expect(page.getByText('Blueprint saved', { exact: true })).toBeVisible();
    await page.getByLabel('Import workflow blueprints', { exact: true }).setInputFiles({
      name: 'workflow-blueprints.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'stateset-durable-blueprints',
          version: 1,
          exportedAt: at,
          blueprints: imported,
        })
      ),
    });
    await expect(page.getByText('Blueprints imported', { exact: true })).toBeVisible();
    const beforeRestart = await page.evaluate(
      async () =>
        (await window.electronAPI!.store.get(
          'durableWorkflowBlueprints'
        )) as DurableWorkflowBlueprint[]
    );
    expect(beforeRestart.map((blueprint) => blueprint.name)).toEqual([
      'Orders audit',
      'Returns audit',
      'Weekly inventory',
    ]);
    expect(new Set(beforeRestart.map((blueprint) => blueprint.id)).size).toBe(3);
    await application.close();
    application = undefined;
    application = await desktop.launch(profile);
    page = await openWorkspace(application);
    const savedBlueprints = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get(
            'durableWorkflowBlueprints'
          )) as DurableWorkflowBlueprint[]
      );
    await expect.poll(savedBlueprints).toEqual(beforeRestart);
    const afterRestart = await savedBlueprints();
    await page.getByRole('button', { name: 'New workflow', exact: true }).click();
    const selector = page.getByLabel('Workflow blueprint', { exact: true });
    await expect(selector.locator('option')).toHaveText([
      'Start from scratch',
      'Orders audit',
      'Returns audit',
      'Weekly inventory',
    ]);
    await selector.selectOption({ label: 'Weekly inventory' });
    await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('Weekly inventory review');
    await expect(page.getByLabel('Commands', { exact: true })).toHaveValue(
      'collect-inventory\n\nverify-report'
    );
    await selector.selectOption({ label: 'Orders audit' });
    await page.getByLabel('Goal', { exact: true }).fill('Keep this working draft');
    await page.getByRole('button', { name: 'Delete selected blueprint', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete blueprint', exact: true })
      .click();
    await expect(page.getByText('Blueprint deleted', { exact: true })).toBeVisible();
    const afterDelete = beforeRestart.filter((blueprint) => blueprint.name !== 'Orders audit');
    await expect.poll(savedBlueprints).toEqual(afterDelete);
    await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('Keep this working draft');
    await expect(page.getByLabel('Commands', { exact: true })).toHaveValue('audit-0');
    await test.info().attach('blueprint-persistence', {
      body: Buffer.from(
        JSON.stringify({
          beforeRestart: beforeRestart.map(({ id, name }) => ({ id, name })),
          afterRestart: afterRestart.map(({ id, name }) => ({ id, name })),
          afterDelete: (await savedBlueprints()).map(({ id, name }) => ({ id, name })),
          removedName: 'Orders audit',
          workingDraftPreserved: true,
        })
      ),
      contentType: 'application/json',
    });
  } finally {
    await application?.close();
  }
});

test('custom background agents survive restart and removing a profile preserves the new draft', async ({
  desktop,
}) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Agent profile workspace',
    slug: 'agent-profile-workspace',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Agent profile brand',
    slug: 'agent-profile-brand',
    enabled: true,
  };
  const workflowRequests: Array<{ method: string; path: string }> = [];
  const managerLayouts: Record<string, unknown> = {};
  const openWorkspace = async (application: ElectronApplication) => {
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.route('**/v1/workflows/**', (route) => {
      workflowRequests.push({
        method: route.request().method(),
        path: new URL(route.request().url()).pathname,
      });
      return route.abort('blockedbyclient');
    });
    await page.evaluate(async () => {
      await window.electronAPI!.store.set('onboardingCompleted', true);
      // The owned profile uses memory-only credentials, so restore its fixture
      // key on each process launch without consulting the host's keyring.
      await window.electronAPI!.auth.setDurableEngineApiKey('custom-agent-fixture-key');
    });
    await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
      },
      { tenant, brand }
    );
    await page.reload();
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    return page;
  };
  const defaultConfiguration = {
    provider: 'openai',
    connectorKey: 'openai-primary',
    model: 'gpt-5.4',
    maxIterations: 10,
    allowedExecutables: ['rg', 'jq', 'cat', 'head', 'tail', 'wc', 'sort'],
    maxTokens: 1024,
    maxTotalTokens: 20_000,
  };
  const firstDraft = {
    name: 'Inventory investigator',
    description: 'Checks inventory exports against saved evidence',
    instructions: 'Inspect the inventory export, report mismatches, and preserve the source files.',
  };
  const nextDraft = {
    name: 'Delivery evidence reviewer',
    description: 'Reviews delivery receipts and reports missing evidence',
    instructions:
      'Inspect the delivery receipts and explain every missing confirmation before finishing.',
  };
  let application: ElectronApplication | undefined;
  try {
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    application = await desktop.launch(profile);
    let page = await openWorkspace(application);
    const savedAgents = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get(
            'durableCustomAgentProfiles'
          )) as DurableAgentProfile[]
      );
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    let manager = page.getByRole('dialog', { name: 'Background agents', exact: true });
    await manager.getByLabel('Name', { exact: true }).fill(firstDraft.name);
    await manager.getByLabel('Description', { exact: true }).fill(firstDraft.description);
    await manager.getByLabel('Instructions', { exact: true }).fill(firstDraft.instructions);
    await expect(manager.locator('button[aria-pressed="true"]')).toHaveText(
      defaultConfiguration.allowedExecutables
    );
    await manager.getByRole('button', { name: 'Create agent', exact: true }).click();
    await expect(manager).toHaveCount(0);
    await expect.poll(savedAgents).toEqual([
      expect.objectContaining({
        ...defaultConfiguration,
        name: firstDraft.name,
        description: firstDraft.description,
        systemPrompt: firstDraft.instructions,
      }),
    ]);
    const beforeRestart = await savedAgents();
    expect(beforeRestart[0].id).toMatch(/^custom-[\da-f-]{36}$/);
    let workflowDialog = page.getByRole('dialog', { name: 'New background workflow', exact: true });
    await expect(
      workflowDialog.locator(`[data-agent-id="${beforeRestart[0].id}"]`)
    ).toHaveAttribute('aria-checked', 'true');
    await workflowDialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await application.close();
    application = undefined;

    application = await desktop.launch(profile);
    page = await openWorkspace(application);
    await expect.poll(savedAgents).toEqual(beforeRestart);
    const afterRestart = await savedAgents();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1024, 768)
    );
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    manager = page.getByRole('dialog', { name: 'Background agents', exact: true });
    await mkdir('dist/verification', { recursive: true });
    for (const theme of ['dark', 'light'] as const) {
      if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme) {
        await manager.getByRole('button', { name: 'Close dialog', exact: true }).click();
        await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        await page.getByRole('button', { name: 'Agents', exact: true }).click();
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme);
      await expect(manager.getByText(firstDraft.name, { exact: true })).toBeVisible();
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      const layout = await manager.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const overlay = element.parentElement!;
        const backdrop = overlay.getBoundingClientRect();
        const probes = [
          element.querySelector('h2')!,
          element.querySelector('article')!,
          element.querySelector('input')!,
        ];
        const inputStyle = getComputedStyle(element.querySelector('input')!);
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          inViewport:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight,
          centered: Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) <= 1,
          coversViewport:
            Math.abs(backdrop.left) <= 1 &&
            Math.abs(backdrop.top) <= 1 &&
            Math.abs(backdrop.width - innerWidth) <= 1 &&
            Math.abs(backdrop.height - innerHeight) <= 1,
          bodyOverlay: overlay.parentElement === document.body,
          unobscured: probes.every((probe) => {
            const bounds = probe.getBoundingClientRect();
            return probe.contains(
              document.elementFromPoint(bounds.left + 2, bounds.top + bounds.height / 2)
            );
          }),
          input: {
            color: inputStyle.color,
            background: inputStyle.backgroundColor,
            opacity: inputStyle.opacity,
            disabled: (element.querySelector('input') as HTMLInputElement).disabled,
          },
        };
      });
      expect(layout.inViewport).toBe(true);
      expect(layout.centered).toBe(true);
      expect(layout.coversViewport).toBe(true);
      expect(layout.bodyOverlay).toBe(true);
      expect(layout.unobscured).toBe(true);
      expect(layout.input.disabled).toBe(false);
      expect(layout.input.opacity).toBe('1');
      expect(layout.input.color).not.toBe(layout.input.background);
      managerLayouts[theme] = layout;
      await page.screenshot({
        path: `dist/verification/agent-manager-${theme}.png`,
        animations: 'disabled',
      });
      const titleId = await manager.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();
      expect(
        (
          await new AxeBuilder({ page })
            .setLegacyMode()
            .include(`[role="dialog"][aria-labelledby="${titleId}"]`)
            .analyze()
        ).violations
      ).toEqual([]);
    }

    await manager.getByLabel('Name', { exact: true }).fill(nextDraft.name);
    await manager.getByLabel('Description', { exact: true }).fill(nextDraft.description);
    await manager.getByLabel('Instructions', { exact: true }).fill(nextDraft.instructions);
    await manager.getByRole('button', { name: `Remove ${firstDraft.name}`, exact: true }).click();
    await page
      .getByRole('alertdialog', { name: `Remove ${firstDraft.name}?`, exact: true })
      .getByRole('button', { name: 'Remove profile', exact: true })
      .click();
    await expect.poll(savedAgents).toEqual([]);
    const afterDelete = await savedAgents();
    await expect(manager.getByText('No custom agents yet', { exact: true })).toBeVisible();
    await expect(manager.getByLabel('Name', { exact: true })).toHaveValue(nextDraft.name);
    await expect(manager.getByLabel('Description', { exact: true })).toHaveValue(
      nextDraft.description
    );
    await expect(manager.getByLabel('Instructions', { exact: true })).toHaveValue(
      nextDraft.instructions
    );
    const draftAfterDelete = {
      name: await manager.getByLabel('Name', { exact: true }).inputValue(),
      description: await manager.getByLabel('Description', { exact: true }).inputValue(),
      instructions: await manager.getByLabel('Instructions', { exact: true }).inputValue(),
    };
    expect(draftAfterDelete).toEqual(nextDraft);
    await manager.getByRole('button', { name: 'Create agent', exact: true }).click();
    await expect(manager).toHaveCount(0);
    await expect.poll(savedAgents).toEqual([
      expect.objectContaining({
        ...defaultConfiguration,
        name: nextDraft.name,
        description: nextDraft.description,
        systemPrompt: nextDraft.instructions,
      }),
    ]);
    const afterSecondSave = await savedAgents();
    expect(afterSecondSave[0].id).toMatch(/^custom-[\da-f-]{36}$/);
    expect(afterSecondSave[0].id).not.toBe(beforeRestart[0].id);
    workflowDialog = page.getByRole('dialog', { name: 'New background workflow', exact: true });
    await expect(
      workflowDialog.locator(`[data-agent-id="${afterSecondSave[0].id}"]`)
    ).toHaveAttribute('aria-checked', 'true');
    expect(workflowRequests).toEqual([]);
    await test.info().attach('custom-agent-persistence', {
      body: Buffer.from(
        JSON.stringify({
          beforeRestart,
          afterRestart,
          afterDelete,
          afterSecondSave,
          removedId: beforeRestart[0].id,
          draftAfterDelete,
          draftPreserved: true,
          workflowRequests,
          managerLayouts,
        })
      ),
      contentType: 'application/json',
    });
  } finally {
    await application?.close();
  }
});

test('oversized multilingual agent instructions remain editable until they fit engine byte limits', async ({
  desktop,
}) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Agent limits workspace',
    slug: 'agent-limits-workspace',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Agent limits brand',
    slug: 'agent-limits-brand',
    enabled: true,
  };
  const workflowRequests: Array<{ method: string; path: string }> = [];
  const rejectedInstructions = '界'.repeat(4001);
  const acceptedInstructions = '界'.repeat(4000);
  let application: ElectronApplication | undefined;
  try {
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    application = await desktop.launch(profile);
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.route(
      (url) => url.pathname === '/v1/workflows' || url.pathname.startsWith('/v1/workflows/'),
      (route) => {
        workflowRequests.push({
          method: route.request().method(),
          path: new URL(route.request().url()).pathname,
        });
        return route.abort('blockedbyclient');
      }
    );
    await page.evaluate(async () => {
      await window.electronAPI!.store.set('onboardingCompleted', true);
      // The owned profile uses memory-only credentials and never consults the host keyring.
      await window.electronAPI!.auth.setDurableEngineApiKey('custom-agent-limits-fixture-key');
    });
    await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
      },
      { tenant, brand }
    );
    await page.reload();
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    const savedAgents = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get('durableCustomAgentProfiles')) as
            DurableAgentProfile[] | undefined
      );
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Background agents', exact: true });
    const instructions = manager.getByLabel('Instructions', { exact: true });
    const createAgent = manager.getByRole('button', { name: 'Create agent', exact: true });
    const workflowDialog = page.getByRole('dialog', {
      name: 'New background workflow',
      exact: true,
    });
    await manager.getByLabel('Name', { exact: true }).fill('Multilingual evidence reviewer');
    await instructions.fill(rejectedInstructions);
    await expect(instructions).toHaveValue(rejectedInstructions);
    await expect(instructions).toHaveAttribute('aria-invalid', 'true');
    await expect(manager.getByRole('alert')).toBeVisible();
    await expect(manager.getByRole('alert')).toContainText('12,003 UTF-8 bytes');
    await expect(createAgent).toBeDisabled();
    await expect(workflowDialog).toHaveCount(0);
    await expect.poll(async () => (await savedAgents()) ?? []).toEqual([]);
    const draftPreserved = (await instructions.inputValue()) === rejectedInstructions;
    const rejectedBytes = Buffer.byteLength(await instructions.inputValue(), 'utf8');
    expect(draftPreserved).toBe(true);
    expect(rejectedBytes).toBe(12_003);

    await instructions.fill(acceptedInstructions);
    await expect(instructions).toHaveValue(acceptedInstructions);
    await expect(instructions).toHaveAttribute('aria-invalid', 'false');
    await expect(manager.getByRole('alert')).toHaveCount(0);
    await expect(createAgent).toBeEnabled();
    const acceptedBytes = Buffer.byteLength(await instructions.inputValue(), 'utf8');
    expect(acceptedBytes).toBe(12_000);
    await createAgent.click();
    await expect(manager).toHaveCount(0);
    await expect.poll(savedAgents).toEqual([
      expect.objectContaining({
        name: 'Multilingual evidence reviewer',
        systemPrompt: acceptedInstructions,
      }),
    ]);
    const records = await savedAgents();
    if (!records || records.length !== 1) throw new Error('Expected one saved custom agent');
    const stored = records[0];
    expect(stored.id).toMatch(
      /^custom-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
    );
    expect(stored.systemPrompt).toBe(acceptedInstructions);
    const storedBytes = Buffer.byteLength(stored.systemPrompt, 'utf8');
    expect(storedBytes).toBe(12_000);
    await expect(workflowDialog).toBeVisible();
    await expect(workflowDialog.locator(`[data-agent-id="${stored.id}"]`)).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(workflowRequests).toEqual([]);
    await test.info().attach('custom-agent-byte-limits', {
      body: Buffer.from(
        JSON.stringify({
          rejectedBytes,
          acceptedBytes,
          draftPreserved,
          profileId: stored.id,
          storedBytes,
          workflowRequests,
        })
      ),
      contentType: 'application/json',
    });
  } finally {
    await application?.close();
  }
});

test('agent save errors stay visible above the open editor in both themes', async ({ desktop }) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Agent feedback workspace',
    slug: 'agent-feedback-workspace',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Agent feedback brand',
    slug: 'agent-feedback-brand',
    enabled: true,
  };
  const draft = {
    name: 'Evidence reviewer',
    instructions: 'Review the supplied evidence and describe any missing confirmations.',
  };
  const workflowRequests: Array<{ theme: string; method: string; path: string }> = [];
  const themes: Record<string, unknown> = {};
  await mkdir('dist/verification', { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    let application: ElectronApplication | undefined;
    try {
      const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
      application = await desktop.launch(profile);
      const page = await application.firstWindow();
      await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
      await page.route(
        (url) => url.pathname === '/v1/workflows' || url.pathname.startsWith('/v1/workflows/'),
        (route) => {
          workflowRequests.push({
            theme,
            method: route.request().method(),
            path: new URL(route.request().url()).pathname,
          });
          return route.abort('blockedbyclient');
        }
      );
      await page.evaluate(async (theme) => {
        await window.electronAPI!.store.set('theme', theme);
        await window.electronAPI!.store.set('onboardingCompleted', true);
        // This credential exists only in this owned app, with no host keyring access.
        await window.electronAPI!.auth.setDurableEngineApiKey('custom-agent-feedback-fixture-key');
      }, theme);
      await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
      await page.context().addInitScript(
        ({ tenant, brand }) => {
          window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
        },
        { tenant, brand }
      );
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme);
      await page.getByRole('link', { name: 'Workflows', exact: true }).click();
      await page.getByRole('button', { name: 'Agents', exact: true }).click();
      const manager = page.getByRole('dialog', { name: 'Background agents', exact: true });
      await manager.getByLabel('Name', { exact: true }).fill(draft.name);
      await manager.getByLabel('Instructions', { exact: true }).fill(draft.instructions);
      await expect(
        manager.getByRole('button', { name: 'Create agent', exact: true })
      ).toBeEnabled();
      // Replace only the public IPC handler in this disposable process, after
      // startup/settings writes finish. Native reads and production source stay intact.
      await application.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('store:set');
        ipcMain.handle('store:set', () => false);
      });
      await manager.getByRole('button', { name: 'Create agent', exact: true }).click();
      const toast = page
        .getByRole('region', { name: 'Notifications', exact: true })
        .getByRole('alert');
      await expect(toast).toBeVisible();
      await expect(toast.locator('.toast-title')).toHaveText('Unable to save agent');
      await expect(toast.locator('.toast-message')).toHaveText(
        'Custom agent profiles could not be saved. Try again.'
      );
      await expect(manager).toBeVisible();
      await expect(manager.getByLabel('Name', { exact: true })).toHaveValue(draft.name);
      await expect(manager.getByLabel('Instructions', { exact: true })).toHaveValue(
        draft.instructions
      );
      const savedProfiles = await page.evaluate(
        async () =>
          (await window.electronAPI!.store.get('durableCustomAgentProfiles')) as
            DurableAgentProfile[] | undefined
      );
      expect(savedProfiles ?? []).toEqual([]);
      await expect(
        page.getByRole('dialog', { name: 'New background workflow', exact: true })
      ).toHaveCount(0);
      const readFeedback = () =>
        toast.evaluate((element) => {
          const toastStyle = getComputedStyle(element);
          const inspect = (target: HTMLElement) => {
            const rect = target.getBoundingClientRect();
            const style = getComputedStyle(target);
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2
            );
            return {
              text: target.getAttribute('aria-label') ?? target.textContent?.trim(),
              unobscured: hit !== null && target.contains(hit),
              hitTag: hit?.tagName ?? null,
              bounds: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              },
              inViewport:
                rect.width > 0 &&
                rect.height > 0 &&
                rect.left >= 0 &&
                rect.top >= 0 &&
                rect.right <= innerWidth &&
                rect.bottom <= innerHeight,
              color: style.color,
              textFillColor: style.webkitTextFillColor,
              opacity: style.opacity,
              visibility: style.visibility,
            };
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            background: toastStyle.backgroundColor,
            opacity: toastStyle.opacity,
            visibility: toastStyle.visibility,
            title: inspect(element.querySelector<HTMLElement>('.toast-title')!),
            message: inspect(element.querySelector<HTMLElement>('.toast-message')!),
            dismiss: inspect(
              element.querySelector<HTMLElement>('[aria-label="Dismiss notification"]')!
            ),
          };
        });
      await expect.poll(async () => (await readFeedback()).opacity).toBe('1');
      const observed = await readFeedback();
      // Retain the real obscured probes even when the pre-fix baseline fails next.
      await test.info().attach(`custom-agent-error-feedback-observed-${theme}`, {
        body: Buffer.from(
          JSON.stringify({
            theme,
            ...observed,
            draftPreserved: true,
            persistedProfileCount: (savedProfiles ?? []).length,
            workflowRequests,
          })
        ),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: `dist/verification/agent-error-${theme}.png`,
        animations: 'disabled',
      });
      await expect
        .poll(
          async () => {
            const feedback = await readFeedback();
            return {
              title: feedback.title.unobscured,
              message: feedback.message.unobscured,
              dismiss: feedback.dismiss.unobscured,
            };
          },
          { timeout: 2500 }
        )
        .toEqual({ title: true, message: true, dismiss: true });
      const feedback = await readFeedback();
      expect(feedback.visibility).toBe('visible');
      for (const probe of [feedback.title, feedback.message, feedback.dismiss]) {
        expect(probe.inViewport).toBe(true);
        expect(probe.opacity).toBe('1');
        expect(probe.visibility).toBe('visible');
        expect(probe.color).not.toBe(feedback.background);
        expect(probe.textFillColor).not.toBe(feedback.background);
      }
      await toast.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
      await expect(toast).toHaveCount(0);
      await expect(manager).toBeVisible();
      await expect(manager.getByLabel('Name', { exact: true })).toHaveValue(draft.name);
      await expect(manager.getByLabel('Instructions', { exact: true })).toHaveValue(
        draft.instructions
      );
      themes[theme] = {
        ...feedback,
        draftPreserved: true,
        draftAfterDismissalPreserved: true,
        managerStayedOpen: true,
        dismissed: true,
        persistedProfileCount: (savedProfiles ?? []).length,
      };
    } finally {
      await application?.close();
    }
  }
  expect(workflowRequests).toEqual([]);
  await test.info().attach('custom-agent-error-feedback', {
    body: Buffer.from(
      JSON.stringify({
        themes,
        noWorkflowRequests: workflowRequests.length === 0,
        workflowRequests,
      })
    ),
    contentType: 'application/json',
  });
});
