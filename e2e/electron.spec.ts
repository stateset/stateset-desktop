import type { Page } from '@playwright/test';
import { test, expect, requireDesktopDisplay, type DesktopHarness } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

const mockTenant = { id: 'tenant_1', name: 'Test Tenant', slug: 'test-tenant', tier: 'pro' };
const mockBrand = {
  id: 'brand_1',
  name: 'Demo Brand',
  slug: 'demo',
  tenant_id: 'tenant_1',
  enabled: true,
};
async function setTestDefaults(page: Page) {
  await page.evaluate(async () => {
    const api = (window as any).electronAPI;
    if (!api?.store) {
      return;
    }
    await Promise.all([api.store.set('onboardingCompleted', true), api.store.set('theme', 'dark')]);
  });
}

async function disablePreference(page: Page, label: string) {
  const checkbox = page.getByLabel(label);
  if (await checkbox.isChecked()) {
    await checkbox.focus();
    await page.keyboard.press('Space');
  }
  await expect(checkbox).not.toBeChecked();
}

async function launchWithMocks(desktop: DesktopHarness) {
  const electronApp = await desktop.launch();

  const page = await electronApp.firstWindow();
  await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`, { timeout: 120000 });

  await page.route('**/health/detailed', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        version: 'test',
        checks: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          nats: { status: 'healthy' },
        },
        circuit_breakers: {
          sandbox: 'closed',
          webhook: 'closed',
          database: 'closed',
          external_api: 'closed',
        },
        resilience_healthy: true,
      }),
    });
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();

    if (url.endsWith('/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant: mockTenant,
          brands: [mockBrand],
        }),
      });
      return;
    }

    if (url.includes('/agents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, sessions: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not mocked in E2E test' }),
    });
  });

  await page.waitForFunction(() => (window as any).electronAPI !== undefined);
  await setTestDefaults(page);
  await page.evaluate(async () => {
    await (window as any).electronAPI.auth.clearApiKey();
  });
  await page.reload();

  await expect(page.getByText('Welcome back')).toBeVisible();

  const hasElectronApi = await page.evaluate(() => typeof (window as any).electronAPI === 'object');
  expect(hasElectronApi).toBe(true);

  await page.evaluate(
    ({ tenant, brand }) => {
      (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
    },
    { tenant: mockTenant, brand: mockBrand }
  );
  await page.context().addInitScript(
    ({ tenant, brand }) => {
      window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
    },
    { tenant: mockTenant, brand: mockBrand }
  );

  await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
  await page.getByLabel('API Key').fill('sk-test-token');
  await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
  await page.waitForTimeout(200);
  const loginError = page.getByText('Invalid API key').or(page.getByText('Login failed'));
  if (await loginError.isVisible()) {
    throw new Error(`Login failed: ${await loginError.textContent()}`);
  }

  await expect(
    page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
  ).toBeVisible();

  return { electronApp, page };
}

test.describe('Electron UI', () => {
  test.beforeAll(async () => {
    requireDesktopDisplay();
  });

  test('login reaches the dashboard', async ({ desktop }) => {
    const { electronApp, page } = await launchWithMocks(desktop);

    try {
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();
    } finally {
      await electronApp?.close();
    }
  });

  test('settings toggles persist', async ({ desktop }) => {
    const { electronApp, page } = await launchWithMocks(desktop);

    try {
      await page.getByRole('link', { name: 'Settings' }).click({ force: true });
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

      const sections = page.getByRole('navigation', { name: 'Settings sections' });
      await sections.getByRole('button', { name: 'Background', exact: true }).click();
      await disablePreference(page, 'Minimize to System Tray');
      await sections.getByRole('button', { name: 'Notifications', exact: true }).click();
      await disablePreference(page, 'Desktop Notifications');
      await disablePreference(page, 'Sound Alerts');
      await sections.getByRole('button', { name: 'Appearance', exact: true }).click();
      await page.getByRole('button', { name: 'Light theme', exact: true }).click();

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const api = window.electronAPI!;
            return {
              theme: await api.store.get('theme'),
              minimizeToTray: await api.store.get('minimizeToTray'),
              desktopNotifications: await api.store.get('desktopNotifications'),
              soundAlerts: await api.store.get('soundAlerts'),
              appliedTheme: document.documentElement.dataset.theme,
            };
          })
        )
        .toMatchObject({
          theme: 'light',
          minimizeToTray: false,
          desktopNotifications: false,
          soundAlerts: false,
          appliedTheme: 'light',
        });
      await page.reload();
      await expect(page.getByRole('button', { name: 'Light theme', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await sections.getByRole('button', { name: 'Background', exact: true }).click();
      await expect(page.getByLabel('Minimize to System Tray')).not.toBeChecked();
      await sections.getByRole('button', { name: 'Notifications', exact: true }).click();
      await expect(page.getByLabel('Desktop Notifications')).not.toBeChecked();
      await expect(page.getByLabel('Sound Alerts')).not.toBeChecked();
    } finally {
      await electronApp?.close();
    }
  });
});
