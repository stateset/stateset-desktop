import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, requireDesktopDisplay } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import { installDesktopApiFixture } from './api-fixture';
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

test.beforeAll(() => requireDesktopDisplay());

for (const theme of ['dark', 'light'] as const) {
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
