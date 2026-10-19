import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, requireDesktopDisplay, type DesktopProfile } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import { installDesktopApiFixture } from './api-fixture';
import { DEFAULT_CHAT_CONFIGURATION } from '../src/features/computer-chat/durableTypes';
import type { DurableChatStatus } from '../src/features/computer-chat/durableTypes';
import requiredSetupChecks from '../src/features/computer-chat/setup-checks.json';

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
  const directories = new Map<string, NonNullable<DurableChatStatus['workspace']>>();
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
        checks: requiredSetupChecks.map((key) => ({
          key,
          status: 'pass',
          message: key === 'sandbox' ? 'Native bridge connected' : `${key} configured`,
        })),
        mcp_servers: [],
      });
      return;
    }
    if (path === '/v1/computer-chats/start') {
      if (
        body.imported_messages?.some(
          (message: { content: string }) => Buffer.byteLength(message.content, 'utf8') > 8000
        )
      ) {
        reply({ message: 'Imported messages require 1–8000 UTF-8 bytes' }, 400);
        return;
      }
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
    if (match[2] === 'workspace' && body.operation === 'list') {
      const directory = directories.get(body.path);
      if (!directory) {
        reply({ message: 'Fixture folder not found' }, 404);
        return;
      }
      state.workspace = directory;
      reply({ accepted: true });
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
    directories,
    receipts,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function openChats(
  application: ElectronApplication,
  theme: 'light' | 'dark' = 'dark'
): Promise<Page> {
  const page = await application.firstWindow();
  await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
  await installDesktopApiFixture(application, page, {
    tenant,
    brand,
    sessions: [],
    sessionsStatus: 200,
  });
  await page.context().addInitScript(
    ({ tenant, brand }) => {
      window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
    },
    { tenant, brand }
  );
  await page.waitForFunction(() => window.electronAPI?.store !== undefined);
  await page.evaluate(async (theme) => {
    await window.electronAPI!.store.set('onboardingCompleted', true);
    await window.electronAPI!.store.set('theme', theme);
  }, theme);
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

type DefaultsSaveFixture = {
  pending: boolean;
  attempts: number;
  failNext: boolean;
  release?: () => void;
};

/** Delay/fail only the owned profile's defaults writes; successful writes still use the production handler. */
async function gateDefaultsWrites(profile: DesktopProfile) {
  const bootstrap = path.join(profile.entry, 'bootstrap.cjs');
  const original = await readFile(bootstrap, 'utf8');
  await writeFile(
    bootstrap,
    `
const { ipcMain: defaultsIpc } = require('electron');
const defaultsHandle = defaultsIpc.handle.bind(defaultsIpc);
const defaultsGate = { pending: false, attempts: 0, failNext: false, release: undefined };
globalThis.__desktopDefaultsFixture = defaultsGate;
defaultsIpc.handle = (channel, listener) => defaultsHandle(channel, channel === 'store:set' ? async (...args) => {
  if (args[1] === 'computerChatPreferences') {
    defaultsGate.attempts++;
    defaultsGate.pending = true;
    await new Promise(resolve => { defaultsGate.release = resolve; });
    defaultsGate.pending = false;
    defaultsGate.release = undefined;
    if (defaultsGate.failNext) {
      defaultsGate.failNext = false;
      throw new Error('Fixture defaults write unavailable');
    }
  }
  return listener(...args);
} : listener);
` + original
  );
}

async function releaseDefaultsWrite(application: ElectronApplication) {
  await application.evaluate(() => {
    const fixture = (
      globalThis as typeof globalThis & { __desktopDefaultsFixture: DefaultsSaveFixture }
    ).__desktopDefaultsFixture;
    if (!fixture.release) throw new Error('No pending defaults write');
    fixture.release();
  });
}

async function defaultsWritePending(application: ElectronApplication) {
  return application.evaluate(
    () =>
      (globalThis as typeof globalThis & { __desktopDefaultsFixture: DefaultsSaveFixture })
        .__desktopDefaultsFixture.pending
  );
}

test.beforeAll(() => requireDesktopDisplay());

for (const theme of ['dark', 'light'] as const) {
  test(`native command palette keeps live selection and long titles readable in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const application = await desktop.launch();
    const firstPage = await application.firstWindow();
    await firstPage.emulateMedia({ reducedMotion: 'reduce' });
    const page = await openChats(application, theme);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 760)
    );
    const records = [
      {
        id: '44444444-4444-4444-8444-444444444441',
        title: `Palette-report-${'reconciliation'.repeat(7)}`,
        createdAt: '2026-10-16T10:00:00.000Z',
        updatedAt: '2026-10-16T10:00:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444442',
        title: 'Palette report recent',
        createdAt: '2026-10-16T10:00:01.000Z',
        updatedAt: '2026-10-16T10:00:01.000Z',
      },
    ].map((record) => ({
      ...record,
      tenantId: tenant.id,
      brandId: brand.id,
      messages: [],
      workflows: [],
      stopped: true,
    }));
    await page.evaluate(async (records) => {
      const modulePath = '/src/features/computer-chat/store.ts';
      const { useComputerChatsStore } = await import(modulePath);
      for (const record of records) await useComputerChatsStore.getState().save(record);
      const original = Element.prototype.scrollIntoView;
      const calls: { id: string; behavior?: ScrollBehavior }[] = [];
      (window as typeof window & { __paletteScrolls: typeof calls }).__paletteScrolls = calls;
      Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
        if (this.id.startsWith('command-option-'))
          calls.push({
            id: this.id,
            behavior: typeof options === 'object' ? options.behavior : undefined,
          });
        original.call(this, options);
      };
    }, records);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command Palette' });
    const search = palette.getByRole('combobox', { name: 'Search commands' });
    await search.fill('palette');
    await search.press('ArrowDown');
    const selected = `command-option-chat-${records[0].id}`;
    await expect(search).toHaveAttribute('aria-activedescendant', selected);
    const geometry = await palette.getByRole('listbox').evaluate((list) => ({
      listOverflow: list.scrollWidth - list.clientWidth,
      optionOverflow: Math.max(
        ...Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).map(
          (row) => row.scrollWidth - row.clientWidth
        )
      ),
    }));
    await mkdir('dist/verification', { recursive: true });
    await writeFile(
      `dist/verification/native-command-palette-layout-${theme}.json`,
      JSON.stringify(geometry, null, 2)
    );
    await page.screenshot({ path: `dist/verification/native-command-palette-${theme}.png` });
    await page.evaluate(async (id) => {
      const modulePath = '/src/features/computer-chat/store.ts';
      const { useComputerChatsStore } = await import(modulePath);
      const current = useComputerChatsStore
        .getState()
        .chats.find((chat: { id: string }) => chat.id === id);
      await useComputerChatsStore
        .getState()
        .save({ ...current, updatedAt: '2026-10-16T11:00:00.000Z' });
    }, records[0].id);
    await expect(palette.getByRole('option').first()).toHaveAttribute('id', selected);
    await expect(search).toHaveAttribute('aria-activedescendant', selected);
    expect(geometry.listOverflow).toBeLessThanOrEqual(1);
    expect(geometry.optionOverflow).toBeLessThanOrEqual(1);
    await expect(
      palette.getByRole('option', { name: records[0].title })
    ).toHaveAccessibleDescription('Computer chat · Computer ended');
    const scrolls = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __paletteScrolls: { id: string; behavior?: ScrollBehavior }[];
          }
        ).__paletteScrolls
    );
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls.every((call) => call.behavior === 'instant')).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .setLegacyMode()
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await search.press('Enter');
    await expect(palette).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.get('chat')).toBe(records[0].id);
    await application.close();
  });

  test(`native workspace navigation preserves address edits and keyboard focus in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      const page = await openChats(application, theme);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Workflow engine URL').fill(engine.url);
      await page.getByLabel('Workflow API key').fill(engineKey);
      await page.getByRole('button', { name: 'Save connection and check' }).click();
      await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
      const first = (await savedChats(page))[0];
      const state = engine.states.get(first.durableSession.workflowId)!;
      const reports = {
        path: '/workspace/reports',
        entries: [
          {
            name: 'drafts',
            path: '/workspace/reports/drafts',
            type: 'directory' as const,
            size_bytes: 0,
          },
          ...Array.from({ length: 5 }, (_, index) => ({
            name: `report-${index}.json`,
            path: `/workspace/reports/report-${index}.json`,
            type: 'file' as const,
            size_bytes: 128,
          })),
        ],
      };
      engine.directories.set(reports.path, reports);
      engine.directories.set('/workspace/reports/drafts', {
        path: '/workspace/reports/drafts',
        entries: [],
      });
      await page.getByRole('button', { name: 'Show computer details' }).click();
      await page.getByRole('tab', { name: 'Files', exact: true }).click();
      const browser = page.getByRole('region', { name: 'Workspace browser' });
      const address = browser.getByRole('textbox', { name: 'Workspace directory' });
      await expect(address).toHaveValue('/workspace');
      // A status observation can arrive after the Files panel has mounted.
      state.workspace = reports;
      await page.getByRole('button', { name: 'Refresh conversation' }).click();
      await expect(address).toHaveValue(reports.path);
      for (const [path, message] of [
        ['/workspace/' + '漢'.repeat(338), '1,024 UTF-8 bytes'],
        ['/workspace/a\u0085b', 'control characters'],
      ]) {
        await address.fill(path);
        await address.press('Enter');
        await expect(browser.getByRole('alert')).toContainText(message);
        await expect(address).toHaveValue(path);
        await expect(address).toHaveAttribute('aria-invalid', 'true');
        await expect(address).toHaveAccessibleDescription(new RegExp(message));
        expect(
          engine.requests.filter((request) => request.path.endsWith('/workspace'))
        ).toHaveLength(0);
      }
      expect(
        (
          await new AxeBuilder({ page })
            .setLegacyMode()
            .include('[aria-label="Workspace browser"]')
            .analyze()
        ).violations
      ).toEqual([]);
      await address.fill(reports.path);
      await address.press('Enter');
      await expect(browser.getByRole('alert')).toHaveCount(0);
      await expect(address).not.toHaveAttribute('aria-invalid', 'true');
      const search = browser.getByRole('searchbox', { name: 'Filter workspace files' });
      await search.fill('drafts');
      const folder = browser.getByRole('button', { name: 'drafts', exact: true });
      await folder.focus();
      await page.keyboard.press('Enter');
      await expect(address).toHaveValue('/workspace/reports/drafts');
      await expect(address).toBeFocused();
      await expect(browser.getByText('This folder is empty.', { exact: true })).toBeVisible();
      await address.fill(reports.path);
      await address.press('Enter');
      await expect(search).toBeVisible();
      await search.fill('missing');
      await search.press('Escape');
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      const inspector = page.getByRole('complementary', {
        name: 'Computer workspace and evidence',
      });
      await expect(inspector).toBeVisible();
      await expect(
        browser.getByRole('list', { name: 'Workspace files' }).getByRole('button')
      ).toHaveCount(6);
      await address.fill('/workspace/my-next-folder');
      state.workspace = { path: '/workspace/observed-elsewhere', entries: reports.entries };
      await page.getByRole('button', { name: 'Refresh conversation' }).click();
      await expect(
        browser.getByRole('button', { name: 'observed-elsewhere', exact: true })
      ).toBeVisible();
      await expect(address).toHaveValue('/workspace/my-next-folder');
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .include('.computer-chat')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: `dist/verification/native-workspace-navigation-${theme}.png` });
      await search.focus();
      await search.press('Escape');
      await expect(inspector).toBeHidden();
      await expect(page.getByRole('button', { name: 'Show computer details' })).toBeFocused();
      expect(
        engine.requests
          .filter((request) => request.path.endsWith('/workspace'))
          .map((request) => request.body.path)
      ).toEqual(['/workspace/reports', '/workspace/reports/drafts', '/workspace/reports']);
      await application.close();
    } finally {
      await engine.close();
    }
  });

  test(`native defaults preserve edits, recover from failed saves and survive restart in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const profile = await desktop.createProfile();
    await gateDefaultsWrites(profile);
    const application = await desktop.launch(profile);
    const page = await openChats(application, theme);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Defaults and permissions', { exact: true }).click();
    const model = page.getByLabel('Computer chat model');
    const save = page.getByRole('button', { name: 'Save defaults for this brand' });
    await save.click();
    await expect.poll(() => defaultsWritePending(application)).toBe(true);
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await model.fill('native-newer-draft');
    await releaseDefaultsWrite(application);
    await expect(save).toBeEnabled();
    await expect(model).toHaveValue('native-newer-draft');
    await expect(page.getByText('Defaults saved', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    const persisted = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get('computerChatPreferences')) as Record<
            string,
            { model: string }
          >
      );
    expect((await persisted())[`${tenant.id}:${brand.id}`].model).toBe(
      DEFAULT_CHAT_CONFIGURATION.model
    );
    await application.evaluate(() => {
      (
        globalThis as typeof globalThis & { __desktopDefaultsFixture: DefaultsSaveFixture }
      ).__desktopDefaultsFixture.failNext = true;
    });
    await save.click();
    await expect.poll(() => defaultsWritePending(application)).toBe(true);
    await releaseDefaultsWrite(application);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Your changes are still here' })
    ).toBeVisible();
    await expect(model).toHaveValue('native-newer-draft');
    expect((await persisted())[`${tenant.id}:${brand.id}`].model).toBe(
      DEFAULT_CHAT_CONFIGURATION.model
    );
    const accessibility = await new AxeBuilder({ page })
      .setLegacyMode()
      .include('[aria-label="Computer setup and defaults"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await save.click();
    await expect.poll(() => defaultsWritePending(application)).toBe(true);
    await releaseDefaultsWrite(application);
    await expect(page.getByText('Defaults saved', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Your changes are still here' })
    ).toHaveCount(0);
    expect((await persisted())[`${tenant.id}:${brand.id}`].model).toBe('native-newer-draft');
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({ path: `dist/verification/native-defaults-save-${theme}.png` });
    await application.close();
    const restarted = await desktop.launch(profile);
    const restored = await openChats(restarted, theme);
    await restored.getByRole('button', { name: 'Settings', exact: true }).click();
    await restored.getByText('Defaults and permissions', { exact: true }).click();
    await expect(restored.getByLabel('Computer chat model')).toHaveValue('native-newer-draft');
    await restarted.close();
  });

  test(`native acceptance settings recover from invalid criteria in ${theme} theme`, async ({
    desktop,
  }) => {
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      const page = await openChats(application, theme);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Workflow engine URL').fill(engine.url);
      await page.getByLabel('Workflow API key').fill(engineKey);
      await page.getByRole('button', { name: 'Save connection and check' }).click();
      await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
      await page.getByText('Acceptance criteria (0)', { exact: true }).click();
      await page.getByLabel('File path', { exact: true }).fill('/workspace/./report.json');
      await page.getByRole('button', { name: 'Add criterion', exact: true }).click();
      const error = page.getByRole('alert').filter({ hasText: 'Choose a file under /workspace' });
      await expect(error).toBeVisible();
      await expect(page.getByRole('button', { name: 'Remove criterion 1' })).toHaveCount(0);
      await expect(page.getByLabel('File path', { exact: true })).toHaveValue(
        '/workspace/./report.json'
      );
      expect(engine.states.size).toBe(0);
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .include('[aria-label="Computer setup and defaults"]')
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: `dist/verification/native-chat-criteria-${theme}.png` });
      await page.getByLabel('File path', { exact: true }).fill('/workspace/report.json');
      await page.getByRole('button', { name: 'Add criterion', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Remove criterion 1' })).toBeVisible();
      await expect(error).toHaveCount(0);
      const longPath = `/workspace/${'delivery-report-'.repeat(12)}2026.json`;
      await page.getByLabel('File path', { exact: true }).fill(longPath);
      await page
        .getByLabel('Expected JSON', { exact: true })
        .fill(JSON.stringify('ready'.repeat(30)));
      await page.getByRole('button', { name: 'Add criterion', exact: true }).click();
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1000, 760)
      );
      const settings = page.locator('.chat-settings');
      await expect
        .poll(() => settings.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeLessThanOrEqual(1);
      const remove = page.getByRole('button', { name: 'Remove criterion 2' });
      await remove.scrollIntoViewIfNeeded();
      await expect(remove).toBeInViewport();
      await page.screenshot({ path: `dist/verification/native-chat-criteria-narrow-${theme}.png` });
      await remove.focus();
      await page.keyboard.press('Enter');
      await expect(remove).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add criterion' })).toBeFocused();
      await page.getByRole('button', { name: 'Save defaults for this brand' }).click();
      await expect(page.getByText('Defaults saved', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
      const start = engine.requests.find((request) => request.path.endsWith('/start'));
      expect(start?.body.criteria).toEqual([
        { path: '/workspace/report.json', kind: 'json', expected: true, pointer: '/success' },
      ]);
      await writeFile(
        `dist/verification/native-chat-criteria-${theme}.json`,
        JSON.stringify(start!.body, null, 2)
      );
      await application.close();
    } finally {
      await engine.close();
    }
  });

  test(`native multilingual chat continuation starts a distinct computer in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      const page = await openChats(application, theme);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Workflow engine URL').fill(engine.url);
      await page.getByLabel('Workflow API key').fill(engineKey);
      await page.getByRole('button', { name: 'Save connection and check' }).click();
      await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      const composer = page.getByRole('textbox', { name: 'Chat message' });
      await expect(composer).toBeEnabled();
      const first = (await savedChats(page))[0];
      const state = engine.states.get(first.durableSession.workflowId)!;
      const original = '🙂漢é'.repeat(2000);
      state.messages = [
        { id: 'multilingual-report', role: 'assistant', content: original, timestamp: Date.now() },
      ];
      state.status = 'stopped';
      state.cleanup_verified = true;
      state.session!.status = 'stopped';
      state.generation++;
      const continuation = page.getByRole('button', {
        name: 'Continue transcript in a new computer',
      });
      await expect(continuation).toBeVisible();
      await expect
        .poll(
          async () =>
            (await savedChats(page)).find((chat) => chat.id === first.id).messages[0]?.content
        )
        .toBe(original);
      await continuation.click();
      await expect(composer).toBeEnabled();
      await expect.poll(() => engine.states.size).toBe(2);
      const starts = engine.requests.filter((request) => request.path.endsWith('/start'));
      expect(starts).toHaveLength(2);
      const imported = starts[1].body.imported_messages;
      expect(imported).toHaveLength(1);
      expect(Buffer.byteLength(imported[0].content, 'utf8')).toBeLessThanOrEqual(8000);
      expect(imported[0].content).toMatch(/^Previous assistant: /);
      expect(imported[0].content).not.toContain('\uFFFD');
      expect(starts[1].body.initial_message).toBeUndefined();
      expect(engine.requests.filter((request) => request.path.endsWith('/messages'))).toEqual([]);
      await expect
        .poll(
          async () =>
            (await savedChats(page)).find((chat) => chat.id !== first.id)?.serverState?.session?.id
        )
        .toBe(`session-${starts[1].body.request_id}`);
      const records = await savedChats(page);
      expect(records.find((chat) => chat.id === first.id).messages[0].content).toBe(original);
      const continued = records.find((chat) => chat.id !== first.id);
      expect(continued.durableSession.workflowId).not.toBe(first.durableSession.workflowId);
      expect(continued.serverState.session.id).not.toBe(first.serverState.session.id);
      expect(continued.serverState.session.currentSandboxId).not.toBe(
        first.serverState.session.currentSandboxId
      );
      await mkdir('dist/verification', { recursive: true });
      await writeFile(
        `dist/verification/native-chat-continuation-${theme}.json`,
        JSON.stringify(starts[1].body, null, 2)
      );
      await application.close();
    } finally {
      await engine.close();
    }
  });

  test(`native conversation menus support keyboard editing and focus recovery in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const application = await desktop.launch();
    const firstPage = await application.firstWindow();
    await firstPage.waitForFunction(() => window.electronAPI?.store !== undefined);
    const fixtureEngine = 'http://127.0.0.1:65530';
    const records = ['October report', 'Reconciliation'].map((title, index) => {
      const id = `33333333-3333-4333-8333-33333333333${index}`;
      const session = {
        id: `saved-computer-${index}`,
        organizationId: tenant.id,
        status: 'stopped',
      };
      const messages = [
        {
          id: `message-${index}`,
          role: 'assistant',
          content: 'The report is ready for review.',
          timestamp: Date.parse('2026-10-15T10:00:00.000Z'),
        },
      ];
      return {
        id,
        tenantId: tenant.id,
        brandId: brand.id,
        title,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        messages,
        workflows: [],
        stopped: true,
        session,
        durableSession: {
          version: 2,
          workflowId: `computer-chat-${brand.id.replace(/-/g, '')}-${id.replace(/-/g, '')}`,
          engineUrl: fixtureEngine,
          configuration: DEFAULT_CHAT_CONFIGURATION,
        },
        serverState: {
          version: 1,
          status: 'stopped',
          request_id: id,
          brand_id: brand.id,
          session,
          messages,
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
          stop_requested: true,
          cleanup_verified: true,
          error: null,
          generation: 1,
        },
      };
    });
    await firstPage.evaluate(
      async ({ records, fixtureEngine }) => {
        await window.electronAPI!.store.set('computerChats', records);
        await window.electronAPI!.store.set('durableWorkflowEngineUrl', fixtureEngine);
      },
      { records, fixtureEngine }
    );
    const page = await openChats(application, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const library = page.getByRole('complementary', { name: 'Computer conversations' });
    const search = library.getByRole('searchbox', { name: 'Search conversations' });
    await library.getByRole('button', { name: /^October report/ }).click();
    await page.getByRole('button', { name: 'Show computer details' }).click();
    const trigger = library.getByRole('button', { name: 'Options for October report' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = library.getByRole('menu', { name: 'Actions for October report' });
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Delete saved chat' })).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('p');
    await expect(menu.getByRole('menuitem', { name: 'Pin' })).toBeFocused();
    const scan = () =>
      new AxeBuilder({ page })
        .setLegacyMode()
        .include('.computer-chat')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect((await scan()).violations).toEqual([]);
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({ path: `dist/verification/chat-library-menu-${theme}.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Escape in the popup must not close the evidence panel behind it.
    await expect(
      page.getByRole('complementary', { name: 'Computer workspace and evidence' })
    ).toBeVisible();
    // Pinning and unpinning reorder rows without changing the open computer.
    const reorderTrigger = library.getByRole('button', { name: 'Options for Reconciliation' });
    await reorderTrigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('p');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await savedChats(page)).find((chat) => chat.id === records[1].id).pinned)
      .toBe(true);
    await expect(reorderTrigger).toBeFocused();
    await expect(reorderTrigger).toHaveAttribute('aria-disabled', 'false');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('u');
    await expect(
      library
        .getByRole('menu', { name: 'Actions for Reconciliation' })
        .getByRole('menuitem', { name: 'Unpin', exact: true })
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await savedChats(page)).find((chat) => chat.id === records[1].id).pinned)
      .toBe(false);
    await expect(reorderTrigger).toBeFocused();
    await expect(page.getByRole('heading', { name: 'October report', exact: true })).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const name = library.getByRole('textbox', { name: 'Conversation name' });
    await expect(name).toBeFocused();
    await name.fill('Discarded name');
    await page.keyboard.press('Escape');
    await expect(name).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await savedChats(page)).find((chat) => chat.id === records[0].id).title).toBe(
      'October report'
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await name.fill('Monthly report');
    await page.keyboard.press('Enter');
    const renamedTrigger = library.getByRole('button', { name: 'Options for Monthly report' });
    await expect(renamedTrigger).toBeFocused();
    expect((await savedChats(page)).find((chat) => chat.id === records[0].id).session.id).toBe(
      records[0].session.id
    );
    await page.keyboard.press('ArrowDown');
    // Tab leaves the popup and preserves the browser's normal focus order.
    await page.keyboard.press('Tab');
    await expect(library.getByRole('menu')).toHaveCount(0);
    await renamedTrigger.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(library.getByRole('button', { name: 'Keep chat' })).toBeFocused();
    expect((await scan()).violations).toEqual([]);
    await page.screenshot({ path: `dist/verification/chat-library-delete-${theme}.png` });
    await page.keyboard.press('Escape');
    await expect(renamedTrigger).toBeFocused();
    expect(await savedChats(page)).toHaveLength(2);
    // Menus near the bottom of a short sidebar must remain fully reachable.
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 600)
    );
    const lowerTrigger = library.getByRole('button', { name: 'Options for Reconciliation' });
    await lowerTrigger.focus();
    await page.keyboard.press('ArrowDown');
    const lowerMenu = library.getByRole('menu', { name: 'Actions for Reconciliation' });
    await expect
      .poll(() =>
        lowerMenu.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const sidebar = node.closest('.chat-library')!.getBoundingClientRect();
          return (
            bounds.top >= sidebar.top &&
            bounds.bottom <= Math.min(sidebar.bottom, window.innerHeight) &&
            bounds.left >= sidebar.left &&
            bounds.right <= sidebar.right
          );
        })
      )
      .toBe(true);
    await page.keyboard.press('End');
    await expect(lowerMenu.getByRole('menuitem', { name: 'Delete saved chat' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(lowerTrigger).toBeFocused();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1400, 900)
    );
    await renamedTrigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('a');
    await page.keyboard.press('Enter');
    await expect(renamedTrigger).toHaveCount(0);
    await expect(search).toBeFocused();
    expect((await savedChats(page)).find((chat) => chat.id === records[0].id).archived).toBe(true);
    await library.getByRole('combobox', { name: 'Filter conversations' }).selectOption('archived');
    await renamedTrigger.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await library.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(search).toBeFocused();
    await expect(renamedTrigger).toHaveCount(0);
    expect((await savedChats(page)).map((chat) => chat.id)).toEqual([records[1].id]);
    await application.close();
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`native transcript preserves reading position and keyboard focus in ${theme} theme`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      const firstPage = await application.firstWindow();
      await firstPage.waitForFunction(() => window.electronAPI?.store !== undefined);
      await firstPage.evaluate(() => window.electronAPI!.store.set('reduceMotion', true));
      const page = await openChats(application, theme);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Workflow engine URL').fill(engine.url);
      await page.getByLabel('Workflow API key').fill(engineKey);
      await page.getByRole('button', { name: 'Save connection and check' }).click();
      await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      const composer = page.getByRole('textbox', { name: 'Chat message' });
      await expect(composer).toBeEnabled();
      expect(engine.states.size).toBe(1);
      const state = [...engine.states.values()][0];
      const message = (index: number) => ({
        id: `reading-${index}`,
        role: 'user' as const,
        content: `Reading message ${index}`,
        timestamp: Date.parse('2026-10-16T10:00:00Z') + index,
      });
      state.messages = Array.from({ length: 130 }, (_, index) => message(index));
      await expect(page.getByRole('button', { name: 'Show older messages (30)' })).toBeAttached();
      const transcript = page.getByRole('region', { name: 'Chat transcript', exact: true });
      await transcript.focus();
      await page.keyboard.press('Home');
      await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBe(0);
      const anchor = transcript.getByText('Reading message 40', { exact: true });
      await anchor.evaluate((node) => {
        const scroller = node.closest<HTMLElement>('.chat-transcript')!;
        scroller.scrollTop +=
          node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 60;
      });
      const latest = page.getByRole('button', { name: 'Jump to latest', exact: true });
      await expect(latest).toBeVisible();
      await composer.fill('Keep this unsent draft while I read');
      const anchorOffset = () =>
        anchor.evaluate(
          (node) =>
            node.getBoundingClientRect().top -
            node.closest('.chat-transcript')!.getBoundingClientRect().top
        );
      const before = await anchorOffset();
      state.messages.push(message(130), message(131));
      await expect(latest).toHaveAccessibleDescription('2 new messages below');
      await expect.poll(async () => Math.abs((await anchorOffset()) - before)).toBeLessThan(2);
      await expect(transcript.getByText('Reading message 30', { exact: true })).toBeAttached();
      await expect(composer).toBeFocused();
      await expect(composer).toHaveValue('Keep this unsent draft while I read');
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .include('.computer-chat')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: `dist/verification/native-chat-reading-${theme}.png` });

      await latest.focus();
      await page.keyboard.press('Enter');
      await expect(latest).toHaveCount(0);
      await expect(transcript).toBeFocused();
      const gapToLatest = () =>
        transcript.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight
        );
      await expect.poll(gapToLatest).toBeLessThanOrEqual(1);
      // Exercise a late layout change, such as an expanded tool result or an image.
      await transcript
        .locator('.chat-message')
        .last()
        .evaluate((element) => {
          (element as HTMLElement).style.paddingBottom = '260px';
        });
      await expect.poll(gapToLatest).toBeLessThanOrEqual(1);
      await expect(transcript).toBeFocused();

      await page.keyboard.press('Home');
      await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBe(0);
      const older = page.getByRole('button', { name: 'Show older messages (32)' });
      await older.focus();
      const beforePrepend = await anchorOffset();
      await page.keyboard.press('Enter');
      await expect(older).toHaveCount(0);
      await expect(transcript).toBeFocused();
      await expect
        .poll(async () => Math.abs((await anchorOffset()) - beforePrepend))
        .toBeLessThan(2);
      await expect(transcript.getByText('Reading message 0', { exact: true })).toBeAttached();
      expect(engine.requests.filter((request) => request.path.endsWith('/messages'))).toEqual([]);
      expect((await savedChats(page))[0].draft).toBe('Keep this unsent draft while I read');
      await application.close();
    } finally {
      await engine.close();
    }
  });
}

async function openComposer(
  application: ElectronApplication,
  engineURL: string,
  theme: 'dark' | 'light'
) {
  const firstPage = await application.firstWindow();
  await firstPage.waitForFunction(() => window.electronAPI?.store !== undefined);
  await firstPage.evaluate(() => window.electronAPI!.store.set('reduceMotion', true));
  const page = await openChats(application, theme);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Workflow engine URL').fill(engineURL);
  await page.getByLabel('Workflow API key').fill(engineKey);
  await page.getByRole('button', { name: 'Save connection and check' }).click();
  await expect(page.getByText('Native bridge connected', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
  return page;
}

for (const theme of ['dark', 'light'] as const) {
  test(`native composer preserves and explains oversized drafts in ${theme} theme`, async ({
    desktop,
  }) => {
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      const page = await openComposer(application, engine.url, theme);
      const composer = page.getByRole('textbox', { name: 'Chat message' });
      const oversized = '🙂'.repeat(2001);
      await composer.fill(oversized);
      await expect(composer).toHaveAttribute('aria-invalid', 'true');
      await expect(composer).toHaveAccessibleDescription(/8,004 \/ 8,000 bytes/);
      await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
      await composer.press('Enter');
      await expect(composer).toHaveValue(oversized);
      await page.getByRole('heading', { name: 'New computer chat', exact: true }).click();
      await expect.poll(async () => (await savedChats(page))[0]?.draft).toBe(oversized);
      expect(engine.requests.filter((request) => request.path.endsWith('/messages'))).toEqual([]);
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .include('.computer-chat')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: `dist/verification/native-composer-limit-${theme}.png` });
      expect(accessibility.violations).toEqual([]);
      await composer.fill('🙂'.repeat(2000));
      await expect(composer).not.toHaveAttribute('aria-invalid');
      await expect(composer).toHaveAccessibleDescription('8,000 / 8,000 bytes');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
      await expect(composer).toBeFocused();
      expect(engine.requests.filter((request) => request.path.endsWith('/messages'))).toEqual([]);
      await application.close();
    } finally {
      await engine.close();
    }
  });

  test(`native composer fits wrapped drafts after resizing in ${theme} theme`, async ({
    desktop,
  }) => {
    const engine = await startEngine();
    try {
      const application = await desktop.launch();
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1400, 900)
      );
      const page = await openComposer(application, engine.url, theme);
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const composer = page.getByRole('textbox', { name: 'Chat message' });
      const draft =
        'Please reconcile the recent orders and explain any differences before making changes. '.repeat(
          2
        );
      await composer.fill(draft);
      const dimensions = () =>
        composer.evaluate((element) => ({
          height: element.clientHeight,
          scroll: element.scrollHeight,
        }));
      const wide = await dimensions();
      expect(wide.height).toBeLessThan(160);
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1000, 760)
      );
      await expect.poll(async () => (await dimensions()).height).toBeGreaterThan(wide.height);
      await expect
        .poll(async () => {
          const size = await dimensions();
          return size.scroll - size.height;
        })
        .toBeLessThanOrEqual(1);
      await expect(composer).toHaveValue(draft);
      await expect(composer).toBeFocused();
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: `dist/verification/native-composer-resize-${theme}.png` });
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1400, 900)
      );
      await expect.poll(async () => (await dimensions()).height).toBe(wide.height);
      await composer.fill('A long draft that stays scrollable. '.repeat(100));
      await expect.poll(async () => (await dimensions()).height).toBe(160);
      expect((await dimensions()).scroll).toBeGreaterThan(160);
      await composer.fill('Short draft');
      await expect.poll(async () => (await dimensions()).height).toBeLessThan(wide.height);
      await expect(composer).toBeFocused();
      expect(pageErrors).toEqual([]);
      expect(engine.requests.filter((request) => request.path.endsWith('/messages'))).toEqual([]);
      await application.close();
    } finally {
      await engine.close();
    }
  });
}

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
      async (tenantId) =>
        window.electronAPI!.computerChat!.request({
          ...(await window.electronAPI!.computerChat!.getConnection()),
          path: '/api/v1/secrets',
          method: 'GET',
          tenantId,
        }),
      tenant.id
    )
  ).rejects.toThrow('outside the allowed API');
  await expect(
    page.evaluate(async () =>
      window.electronAPI!.computerChat!.request({
        ...(await window.electronAPI!.computerChat!.getConnection()),
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

test('native chat requests stay bound to their saved connection after URL and credential changes', async ({
  desktop,
}) => {
  const first = await startEngine();
  const second = await startEngine();
  try {
    const application = await desktop.launch();
    const page = await application.firstWindow();
    await page.waitForFunction(() => window.electronAPI?.computerChat !== undefined);
    const original = await page.evaluate(
      async ({ url, key }) => {
        await window.electronAPI!.store.set('durableWorkflowEngineUrl', url);
        await window.electronAPI!.auth.setDurableEngineApiKey(key);
        return window.electronAPI!.computerChat!.getConnection();
      },
      { url: first.url, key: engineKey }
    );
    const diagnostic = {
      path: '/v1/computer-chats/diagnostics',
      method: 'POST' as const,
      tenantId: tenant.id,
      body: { brand_id: brand.id },
    };
    expect(
      await page.evaluate((request) => window.electronAPI!.computerChat!.request(request), {
        ...diagnostic,
        ...original,
      })
    ).toMatchObject({ ok: true, status: 200 });
    await page.evaluate(
      (url) => window.electronAPI!.store.set('durableWorkflowEngineUrl', url),
      second.url
    );
    expect(
      await page.evaluate((request) => window.electronAPI!.computerChat!.request(request), {
        ...diagnostic,
        ...original,
      })
    ).toMatchObject({ ok: false, status: 409 });
    expect(second.requests).toHaveLength(0);
    const beforeKey = await page.evaluate(() => window.electronAPI!.computerChat!.getConnection());
    await page.evaluate(() =>
      window.electronAPI!.auth.setDurableEngineApiKey('different-test-key')
    );
    expect(
      await page.evaluate((request) => window.electronAPI!.computerChat!.request(request), {
        ...diagnostic,
        ...beforeKey,
      })
    ).toMatchObject({ ok: false, status: 409 });
    expect(second.requests).toHaveLength(0);
    await page.evaluate((key) => window.electronAPI!.auth.setDurableEngineApiKey(key), engineKey);
    const restored = await page.evaluate(() => window.electronAPI!.computerChat!.getConnection());
    expect(restored.revision).not.toBe(beforeKey.revision);
    expect(JSON.stringify(restored)).not.toContain(engineKey);
    expect(
      await page.evaluate((request) => window.electronAPI!.computerChat!.request(request), {
        ...diagnostic,
        ...restored,
      })
    ).toMatchObject({ ok: true, status: 200 });
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
    expect(second.requests[0].body).toEqual({ brand_id: brand.id });
    await application.close();
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
