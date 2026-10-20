import { mkdir } from 'node:fs/promises';
import { test, expect, requireDesktopDisplay } from './desktop';
import { installDesktopApiFixture } from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

test.beforeAll(() => requireDesktopDisplay());
for (const theme of ['dark', 'light'] as const) {
  test(`Sandbox API chats provision separate computers and reopen without replay in ${theme} theme`, async ({
    desktop,
  }, testInfo) => {
    test.setTimeout(180_000);
    const tenant = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Sandbox test',
      slug: 'sandbox-test',
      tier: 'pro',
    };
    const brand = {
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenant.id,
      name: 'Test brand',
      slug: 'test',
      enabled: true,
    };
    const application = await desktop.launch();
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await installDesktopApiFixture(application, page, {
      tenant,
      brand,
      sessions: [],
      sessionsStatus: 200,
      sandboxChats: true,
    });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as never;
      },
      { tenant, brand }
    );
    await page.evaluate(async (theme) => {
      await window.electronAPI!.store.set('onboardingCompleted', true);
      await window.electronAPI!.store.set('theme', theme);
      await window.electronAPI!.auth.setSandboxApiKey('native-sandbox-test-key');
      await window.electronAPI!.secrets!.clearLocal();
    }, theme);
    await page.reload();
    await page.getByRole('link', { name: 'Chats', exact: true }).click();
    await application.evaluate(() => {
      (globalThis as any).__desktopSandboxChats.holdStarts = true;
    });
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    try {
      await expect
        .poll(() =>
          application.evaluate(() => (globalThis as any).__desktopSandboxChats.startWaiters.length)
        )
        .toBe(1);
      await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText(
        'Preparing computer…'
      );
      await expect(
        page
          .getByRole('list', { name: 'Saved conversations' })
          .getByText('Preparing computer…', { exact: true })
      ).toBeVisible();
      const composer = page.getByRole('textbox', { name: 'Chat message' });
      await expect(composer).toBeEnabled();
      await composer.fill('Draft for my first computer');
      await composer.press('Enter');
      await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
      await expect(composer).toHaveValue('Draft for my first computer');
      await expect(composer).toHaveAccessibleDescription(/You can draft now/);
      await expect(composer).toBeInViewport({ ratio: 1 });
      await testInfo.attach(`Draft preparation ${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.getByRole('button', { name: 'Pause setup', exact: true }).click();
      await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText(
        'Pausing…'
      );
      await expect(page.getByRole('button', { name: 'Pausing…', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeDisabled();
      await expect(composer).toBeEnabled();
      await expect(composer).toHaveValue('Draft for my first computer');
      await testInfo.attach(`Pause pending ${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await expect(
        page
          .getByRole('list', { name: 'Saved conversations' })
          .getByText('Pausing…', { exact: true })
      ).toBeVisible();
      await composer.focus();
      await page.keyboard.press('Control+k');
      const palette = page.getByRole('dialog');
      const commandSearch = palette.getByRole('combobox', { name: 'Search commands' });
      await commandSearch.fill('Pausing');
      await expect(palette.getByRole('option')).toHaveCount(1);
      await expect(palette.getByRole('option')).toHaveAccessibleDescription(
        'Computer chat · Pausing…'
      );
      await expect(commandSearch).toBeFocused();
      await testInfo.attach(`Live status ${theme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await application.evaluate(() => {
        const state = (globalThis as any).__desktopSandboxChats;
        state.holdStarts = false;
        for (const release of state.startWaiters.splice(0)) release();
      });
    }
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText('Paused');
    const commandSearch = page.getByRole('combobox', { name: 'Search commands' });
    await expect(commandSearch).toHaveValue('Pausing');
    await expect(commandSearch).toBeFocused();
    await expect(page.getByRole('dialog').getByRole('option')).toHaveCount(0);
    await commandSearch.fill('Paused');
    await expect(page.getByRole('dialog').getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('dialog').getByRole('option')).toHaveAccessibleDescription(
      'Computer chat · Paused'
    );
    await commandSearch.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeFocused();
    await expect(
      page.getByRole('list', { name: 'Saved conversations' }).getByText('Paused', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('status', { name: 'Pause notice' })).toContainText(
      'Computer setup paused.'
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeEnabled();
    await testInfo.attach(`Setup paused ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Draft for my first computer'
    );
    const saved = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get('computerChats')) as Array<{
            id: string;
            sandboxApiSession: { version: number };
            session: { id: string; currentSandboxId: string };
            draft?: string;
            artifactVerification?: {
              requestId: string;
              sha256: string;
              verification: { verified: boolean };
            };
          }>
      );
    const first = (await saved())[0];
    expect(first.sandboxApiSession).toEqual({ version: 1 });
    await page.getByText('Computer and permissions', { exact: true }).click();
    await page.getByLabel('Sandbox chat model', { exact: true }).fill('sandbox-fixture-model');
    await page.getByRole('checkbox', { name: 'Check execution policy with NSR' }).uncheck();
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Chat message' }).press('Enter');
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(page.getByText('Preferences saved for this chat', { exact: true })).toBeVisible();
    await expect(page.getByText('NSR policy checks off', { exact: true })).toBeVisible();
    await page.getByText('Computer and permissions', { exact: true }).click();
    await expect(page.getByText('NSR policy checks off', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Draft for my first computer');
    await page.getByRole('button', { name: 'New Chat', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText('Ready');
    await expect
      .poll(async () => (await saved()).filter((chat) => chat.session?.currentSandboxId).length)
      .toBe(2);
    const second = (await saved()).find((chat) => chat.id !== first.id)!;
    expect(second.session.id).not.toBe(first.session.id);
    expect(second.session.currentSandboxId).not.toBe(first.session.currentSandboxId);
    const requests = () =>
      application.evaluate(
        () =>
          (globalThis as any).__desktopSandboxChats.requests as Array<{
            path: string;
            method: string;
            idempotencyKey: string;
            body?: any;
          }>
      );
    const mutations = (await requests()).filter((request) => request.method === 'POST');
    expect(mutations).toHaveLength(4);
    expect(
      mutations
        .filter((request) => request.path === '/api/v1/agent/sessions')
        .every((request) => request.idempotencyKey && request.body?.sandbox.durable === false)
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText('Ready');
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(mutations);
    const savedConversations = page.getByRole('list', { name: 'Saved conversations' });
    await savedConversations
      .getByRole('button', { name: /^New computer chat.*Unsent draft/ })
      .click();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText('Paused');
    await expect(page.getByRole('status', { name: 'Pause notice' })).toContainText(
      'Computer setup paused.'
    );
    await expect(page.getByText('NSR policy checks off', { exact: true })).toBeVisible();
    await page.getByText('Computer and permissions', { exact: true }).click();
    await expect(page.getByLabel('Sandbox chat model', { exact: true })).toHaveValue(
      'sandbox-fixture-model'
    );
    await expect(
      page.getByRole('checkbox', { name: 'Check execution policy with NSR' })
    ).not.toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Draft for my first computer'
    );
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await testInfo.attach(`Chat preferences ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await savedConversations
      .getByRole('button', { name: 'New computer chat Ready', exact: true })
      .click();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText('Ready');
    await page.getByText('Computer and permissions', { exact: true }).click();
    await expect(page.getByLabel('Sandbox chat model', { exact: true })).toHaveValue(
      'claude-sonnet-4-6'
    );
    await expect(
      page.getByText(`Sandbox: ${second.session.currentSandboxId}`, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Check execution policy with NSR' })
    ).toBeChecked();
    await page
      .getByRole('textbox', { name: 'Chat message' })
      .fill('Keep this task while I configure NSR');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Save an NSR policy API key');
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Keep this task while I configure NSR'
    );
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(mutations);
    await page.getByRole('button', { name: 'Connection settings', exact: true }).click();
    const setup = page.getByRole('region', { name: 'Sandbox connection' });
    await expect(setup.getByText('Sandbox key saved', { exact: true })).toBeVisible();
    await expect(setup.getByText('Add an NSR policy API key', { exact: true })).toBeVisible();
    await expect(
      setup.getByText(/Saved keys have not been tested against live services/)
    ).toBeVisible();
    await testInfo.attach(`Connection setup ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByLabel('NSR policy API key', { exact: true }).fill('native-policy-test-key');
    await page.getByRole('button', { name: 'Save API keys', exact: true }).click();
    await expect(page.getByText('API keys saved', { exact: true })).toBeVisible();
    await expect(setup.getByText('NSR key saved for this brand', { exact: true })).toBeVisible();
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(mutations);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Verify a file', { exact: true }).click();
    await page.getByLabel('Workspace file', { exact: true }).fill('/workspace/report.txt');
    await page.getByLabel('Expected value', { exact: true }).fill('$42');
    const checkFile = page.getByRole('button', { name: 'Check file with NSR', exact: true });
    await checkFile.click();
    await expect(
      page.getByText('Collected file matched your check.', { exact: true })
    ).toBeVisible();
    await expect(checkFile).toBeEnabled();
    const verified = (await saved()).find((chat) => chat.id === second.id)!.artifactVerification!;
    expect(verified.verification.verified).toBe(true);
    expect(JSON.stringify(await saved())).not.toContain('Sandbox report: $42');
    expect(JSON.stringify(await saved())).not.toContain('native-policy-test-key');
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page
      .getByText('Collected file matched your check.', { exact: true })
      .scrollIntoViewIfNeeded();
    await testInfo.attach(`File verification ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByLabel('Expected value', { exact: true }).fill('$99');
    await checkFile.click();
    await expect(
      page.getByText('Collected file did not match your check.', { exact: true })
    ).toBeVisible();
    await expect(checkFile).toBeEnabled();
    const failed = (await saved()).find((chat) => chat.id === second.id)!.artifactVerification!;
    expect(failed.verification.verified).toBe(false);
    await application.evaluate(() => {
      (globalThis as any).__desktopSandboxChats.tamperNextReceipt = true;
    });
    await page.getByLabel('Expected value', { exact: true }).fill('$42');
    await checkFile.click();
    await expect(page.getByRole('alert')).toContainText('verification receipt does not match');
    await expect(checkFile).toBeEnabled();
    expect(
      (await saved()).find((chat) => chat.id === second.id)!.artifactVerification!.requestId
    ).toBe(failed.requestId);
    await page.getByText('Verify a file', { exact: true }).click();
    await mkdir('dist/verification/sandbox-api-chats', { recursive: true });
    await page.screenshot({ path: `dist/verification/sandbox-api-chats/native-${theme}.png` });
    await testInfo.attach(`Sandbox API chat ${theme}`, {
      path: `dist/verification/sandbox-api-chats/native-${theme}.png`,
      contentType: 'image/png',
    });
    // Restore a task checkpoint left by an app that exited before completion.
    const beforeInterrupted = (await requests()).filter((request) => request.method === 'POST');
    await page.evaluate(async (id) => {
      const storeModule = '/src/features/computer-chat/store.ts';
      const { useComputerChatsStore } = await import(storeModule);
      const store = useComputerChatsStore.getState();
      const records = store.chats as Array<Record<string, unknown>>;
      await store.save(
        records
          .map((record) =>
            record.id === id
              ? {
                  ...record,
                  error: undefined,
                  agentTurnUnfinished: true,
                  messages: [
                    {
                      id: 'interrupted-task',
                      role: 'user',
                      content: 'Prepare the saved report',
                      timestamp: 1,
                    },
                  ],
                }
              : record
          )
          .find((record) => record.id === id)
      );
    }, second.id);
    await page.reload();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText(
      'Work interrupted'
    );
    await expect(page.getByRole('status', { name: 'Unfinished task' })).toContainText(
      'Send a follow-up to continue.'
    );
    await expect(page.getByText('Prepare the saved report', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Keep this task while I configure NSR'
    );
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const filter = page.getByRole('combobox', { name: 'Filter conversations' });
    await expect(
      filter.getByRole('option', { name: 'Needs attention (1)', exact: true })
    ).toBeAttached();
    await filter.selectOption('attention');
    await expect(
      page.getByRole('list', { name: 'Saved conversations' }).getByRole('listitem')
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('list', { name: 'Saved conversations' })
        .getByText('Work interrupted', { exact: true })
    ).toBeVisible();
    await filter.selectOption('all');
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(
      beforeInterrupted
    );
    await testInfo.attach(`Interrupted work ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    // Reading a long saved conversation never starts work or loses its draft.
    const beforeHistory = (await requests()).filter((request) => request.method === 'POST');
    await page.evaluate(async (id) => {
      const storeModule = '/src/features/computer-chat/store.ts';
      const { useComputerChatsStore } = await import(storeModule);
      const store = useComputerChatsStore.getState();
      const records = store.chats as Array<Record<string, unknown>>;
      await store.save(
        records
          .map((record) =>
            record.id !== id
              ? record
              : {
                  ...record,
                  title: 'History review',
                  messages: Array.from({ length: 130 }, (_, index) => ({
                    id: `history-${index}`,
                    role: 'user',
                    content: `Saved task ${index}`,
                    timestamp: index,
                  })),
                }
          )
          .find((record) => record.id === id)
      );
    }, first.id);
    await page.reload();
    const library = page.getByRole('list', { name: 'Saved conversations' });
    await library.getByRole('button', { name: /^History review/ }).click();
    const transcript = page.getByRole('region', { name: 'Chat transcript', exact: true });
    await expect(transcript.getByText('Saved task 129', { exact: true })).toBeInViewport();
    await expect(transcript.getByText('Saved task 0', { exact: true })).toHaveCount(0);
    await transcript.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('button', { name: 'Show older messages (30)', exact: true }).click();
    await expect(transcript.getByText('Saved task 0', { exact: true })).toBeAttached();
    const latest = page.getByRole('button', { name: 'Jump to latest', exact: true });
    await latest.focus();
    await latest.press('Enter');
    await expect(transcript).toBeFocused();
    await expect(transcript.getByText('Saved task 129', { exact: true })).toBeInViewport();
    await expect(latest).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Draft for my first computer'
    );
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await testInfo.attach(`Sandbox history ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await library.getByRole('button', { name: /^New computer chat/ }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Keep this task while I configure NSR'
    );
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(
      beforeHistory
    );
    // An owned saved receipt from an earlier computer is inspection-only.
    const beforeRecovery = (await requests()).filter((request) => request.method === 'POST');
    await page.evaluate(
      async ({ id, sessionId }) => {
        const storeModule = '/src/features/computer-chat/store.ts';
        const { useComputerChatsStore } = await import(storeModule);
        const store = useComputerChatsStore.getState();
        const records = store.chats as Array<Record<string, unknown>>;
        await store.save(
          records
            .map((record) =>
              record.id !== id
                ? record
                : {
                    ...record,
                    error: undefined,
                    messages: [],
                    pending: {
                      requestId: crypto.randomUUID(),
                      computer: {
                        sessionId,
                        sandboxId: 'earlier-computer',
                        organizationId: 'sandbox-test-org',
                      },
                      action: {
                        name: 'execute',
                        arguments: { command: ['printf', 'saved report'] },
                      },
                      command: ['printf', 'saved report'],
                      durable: false,
                      verify: true,
                      result: {
                        exitCode: 0,
                        stdout: 'Unverified saved report',
                        stderr: '',
                        outputTruncated: false,
                      },
                    },
                  }
            )
            .find((record) => record.id === id)
        );
      },
      { id: second.id, sessionId: second.session.id }
    );
    await page.reload();
    await expect(page.getByRole('region', { name: 'Action recovery', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Computer changed', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Review the pending action below before continuing this conversation.', {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByText('Your computer is ready. What would you like to work on?', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^(Recover action|Verify saved result|Check workflow)$/ })
    ).toHaveCount(0);
    await page
      .getByRole('textbox', { name: 'Chat message' })
      .fill('Draft while reviewing recovery');
    await page.getByRole('textbox', { name: 'Chat message' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveAccessibleDescription(
      /Nothing sends automatically/
    );
    const checkStatus = page.getByRole('button', { name: 'Check computer status', exact: true });
    await expect(checkStatus).toBeEnabled();
    await checkStatus.click();
    await expect(checkStatus).toBeEnabled();
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(
      beforeRecovery
    );
    await page.getByText('Saved output', { exact: true }).click();
    await expect(page.getByLabel('Saved standard output', { exact: true })).toHaveText(
      'Unverified saved report'
    );
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Stop computer', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await testInfo.attach(`Action recovery ${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Stop computer', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toHaveValue(
      'Draft while reviewing recovery'
    );
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText(
      'Computer ended'
    );
    await expect(
      transcript.getByText(
        'This computer has ended. Your chat is saved. Start a new chat to continue.',
        { exact: true }
      )
    ).toBeVisible();
    await expect
      .poll(
        async () => (await requests()).filter((request) => request.path.endsWith('/stop')).length
      )
      .toBe(1);
  });
}
