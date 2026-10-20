import { version } from '../package.json';
import { test, expect, requireDesktopDisplay } from './desktop';
import {
  installDesktopApiFixture,
  configureDesktopActions,
  getDesktopActionRequests,
} from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Recovery workspace',
  slug: 'recovery',
  tier: 'pro',
};
const brand = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: tenant.id,
  name: 'Owned recovery',
  slug: 'recovery',
  enabled: true,
};
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const key = `${tenant.id}:${brand.id}`;
const sessions = () =>
  ids.map((id, index) => ({
    id,
    tenant_id: tenant.id,
    brand_id: brand.id,
    name: `Owned restart ${index + 1}`,
    agent_type: 'response',
    status: 'stopped',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 10,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      mcp_servers: [],
      model: 'claude-sonnet-4-6',
      temperature: 0,
    },
    metrics: {
      loop_count: 0,
      tokens_used: 0,
      tool_calls: 0,
      errors: 0,
      messages_sent: 0,
      uptime_seconds: 0,
    },
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
  }));
test.beforeAll(() => requireDesktopDisplay());
for (const mode of ['enabled', 'disabled', 'opt-out-pending'] as const) {
  test(`automatic agent recovery respects confirmed settings and ownership in ${mode} mode`, async ({
    desktop,
  }) => {
    // Allow bounded cold startup on shared workstations; assertions still use normal limits.
    test.setTimeout(120_000);
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    const app = await desktop.launch(profile);
    try {
      const page = await app.firstWindow();
      expect(await page.evaluate(() => window.electronAPI!.app.getVersion())).toBe(version);
      let pageErrors = 0;
      page.on('pageerror', () => pageErrors++);
      await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
      await page.evaluate(
        async ({ key, ids, enabled }) => {
          await window.electronAPI!.store.set('onboardingCompleted', true);
          await window.electronAPI!.store.set('autoStartAgentsOnLaunch', enabled);
          await window.electronAPI!.store.set('runningAgents', {
            [key]: ids,
            'other-tenant:other-brand': ['untouched'],
            '11111111-1111-4111-8111-111111111111:55555555-5555-4555-8555-555555555555': [
              '66666666-6666-4666-8666-666666666666',
            ],
          });
        },
        { key, ids, enabled: mode !== 'disabled' }
      );
      await installDesktopApiFixture(app, page, {
        tenant,
        brand,
        sessions: [
          ...sessions(),
          {
            ...sessions()[0],
            id: '66666666-6666-4666-8666-666666666666',
            brand_id: '55555555-5555-4555-8555-555555555555',
            name: 'Other brand agent',
          },
        ],
        actions: { blocked: mode === 'opt-out-pending' },
      });
      await page.context().addInitScript(
        ({ tenant, brand }) => {
          window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
        },
        { tenant, brand }
      );
      const listed = page.waitForResponse(
        (r) => r.request().method() === 'GET' && r.url().includes('/agents')
      );
      await page.reload();
      await listed;
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await page
        .getByRole('navigation', { name: 'Settings sections' })
        .getByRole('button', { name: 'Background', exact: true })
        .click();
      const checkbox = page.getByRole('checkbox', {
        name: 'Auto-start Agents on Launch',
        exact: true,
      });
      await expect(checkbox).toHaveAttribute('aria-busy', 'false');
      if (mode === 'disabled') {
        await expect(checkbox).not.toBeChecked();
        await expect
          .poll(() =>
            page.evaluate(
              async (key) =>
                (
                  (await window.electronAPI!.store.get('runningAgents')) as Record<string, string[]>
                )[key],
              key
            )
          )
          .toEqual([]);
      } else if (mode === 'enabled') {
        await expect.poll(async () => (await getDesktopActionRequests(app)).length).toBe(2);
        await expect
          .poll(() =>
            page.evaluate(
              async (key) =>
                (
                  (await window.electronAPI!.store.get('runningAgents')) as Record<string, string[]>
                )[key],
              key
            )
          )
          .toEqual(ids);
      } else {
        await expect.poll(async () => (await getDesktopActionRequests(app)).length).toBe(1);
        await checkbox.uncheck();
        await expect(checkbox).toHaveAttribute('aria-busy', 'false');
        expect(
          await page.evaluate(() => window.electronAPI!.store.get('autoStartAgentsOnLaunch'))
        ).toBe(false);
        const completed = page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith(`/${ids[0]}/start`)
        );
        await configureDesktopActions(app, { blocked: false });
        await (await completed).finished();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await page.evaluate(() => window.electronAPI!.store.get('runningAgents'));
      }
      const requests = await getDesktopActionRequests(app);
      const expected = mode === 'enabled' ? ids : mode === 'disabled' ? [] : [ids[0]];
      expect(requests).toEqual(expected.map((id) => ({ id, action: 'start' })));
      const saved = (await page.evaluate(() =>
        window.electronAPI!.store.get('runningAgents')
      )) as Record<string, string[]>;
      expect(saved['other-tenant:other-brand']).toEqual(['untouched']);
      expect(
        saved['11111111-1111-4111-8111-111111111111:55555555-5555-4555-8555-555555555555']
      ).toEqual(['66666666-6666-4666-8666-666666666666']);
      expect(pageErrors).toBe(0);
      const info = test.info();
      await info.attach('background-agent-recovery', {
        body: Buffer.from(
          JSON.stringify({
            mode,
            requests,
            expected,
            unrelatedWorkspaceRetained: true,
            pageErrors,
            preference: await page.evaluate(() =>
              window.electronAPI!.store.get('autoStartAgentsOnLaunch')
            ),
            qualification:
              'Owned native profile and original IPC with controlled HTTPS engine responses. Pending opt-out prevents follow-up starts; an already submitted start can complete. No live engine, sandbox, Temporal or NSR execution is claimed.',
          })
        ),
        contentType: 'application/json',
      });
    } finally {
      await configureDesktopActions(app, { blocked: false }).catch(() => {});
      await app.close();
    }
  });
}
