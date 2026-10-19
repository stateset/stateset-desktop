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
    }, theme);
    await page.reload();
    await page.getByRole('link', { name: 'Chats', exact: true }).click();
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
    const saved = () =>
      page.evaluate(
        async () =>
          (await window.electronAPI!.store.get('computerChats')) as Array<{
            id: string;
            sandboxApiSession: { version: number };
            session: { id: string; currentSandboxId: string };
            draft?: string;
          }>
      );
    const first = (await saved())[0];
    expect(first.sandboxApiSession).toEqual({ version: 1 });
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Draft for my first computer');
    await page.getByRole('button', { name: 'New Chat', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
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
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeEnabled();
    expect((await requests()).filter((request) => request.method === 'POST')).toEqual(mutations);
    await page.getByText('Computer and permissions', { exact: true }).click();
    await expect(
      page.getByText(`Sandbox: ${second.session.currentSandboxId}`, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Check actions and outputs with NSR' })
    ).toBeChecked();
    await mkdir('dist/verification/sandbox-api-chats', { recursive: true });
    await page.screenshot({ path: `dist/verification/sandbox-api-chats/native-${theme}.png` });
    await testInfo.attach(`Sandbox API chat ${theme}`, {
      path: `dist/verification/sandbox-api-chats/native-${theme}.png`,
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Stop computer', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeDisabled();
    await expect(page.getByRole('status', { name: 'Conversation status' })).toHaveText(
      'Computer ended'
    );
    await expect
      .poll(
        async () => (await requests()).filter((request) => request.path.endsWith('/stop')).length
      )
      .toBe(1);
  });
}
