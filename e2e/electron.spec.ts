import type { Page } from '@playwright/test';
import { test, expect, requireDesktopDisplay, type DesktopHarness } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { installDesktopApiFixture } from './api-fixture';

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

  for (const mode of [
    { name: 'browser-dark', packaged: false, theme: 'dark' },
    { name: 'browser-light', packaged: false, theme: 'light' },
    { name: 'file-light', packaged: true, theme: 'light' },
  ] as const) {
    test(`stale routes recover in the same desktop window in ${mode.name}`, async ({ desktop }) => {
      const application = await desktop.launch(desktop.createProfile({ packaged: mode.packaged }));
      const page = await application.firstWindow();
      await page.waitForURL(mode.packaged ? /^file:\/\// : `${DESKTOP_TEST_ORIGIN}/**`);
      await installDesktopApiFixture(application, page, {
        tenant: mockTenant,
        brand: mockBrand,
        sessions: [],
        apiOrigin: mode.packaged
          ? process.env.VITE_API_URL || 'https://engine.stateset.cloud.stateset.app'
          : undefined,
      });
      await page.evaluate(async (theme) => {
        await window.electronAPI!.store.set('onboardingCompleted', true);
        await window.electronAPI!.store.set('theme', theme);
      }, mode.theme);
      await page.reload();
      await expect(page.getByText('Welcome back')).toBeVisible();
      await page.evaluate(
        ({ tenant, brand }) => {
          window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
        },
        { tenant: mockTenant, brand: mockBrand }
      );
      await page.getByRole('button', { name: 'API Key', exact: true }).click();
      await page.getByLabel('API Key').fill('sk-test-route-recovery');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();
      const documentUrl = page.url().split('#')[0];
      const marker = await page.evaluate(() => {
        const marker = crypto.randomUUID();
        (window as any).__routeRecoveryMarker = marker;
        return marker;
      });
      const openMissing = async () => {
        await page.evaluate((packaged) => {
          window.history.pushState(
            {},
            '',
            packaged ? '#/missing-page?from=stale-link' : '/missing-page?from=stale-link'
          );
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, mode.packaged);
        await expect(
          page.getByRole('heading', { name: 'Page not found', exact: true })
        ).toBeFocused();
        await expect(page).toHaveTitle('Page not found — StateSet');
      };
      await openMissing();
      await expect(
        page.getByRole('link', { name: 'Back to Dashboard', exact: true })
      ).toHaveAttribute('href', mode.packaged ? '#/' : '/');
      const accessibility = await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({
        path: `dist/verification/native-route-missing-${mode.name}.png`,
        animations: 'disabled',
      });
      await page.getByRole('link', { name: 'Open chats', exact: true }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Chats', exact: true })
      ).toBeVisible();
      expect(await page.evaluate(() => (window as any).__routeRecoveryMarker)).toBe(marker);
      await openMissing();
      await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();
      expect(await page.evaluate(() => (window as any).__routeRecoveryMarker)).toBe(marker);
      if (mode.packaged) expect(page.url().split('#')[0]).toBe(documentUrl);
      await application.close();
    });
  }

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

  for (const theme of ['dark', 'light'] as const) {
    test(`updater outcomes remain accurate and accessible in ${theme} theme`, async ({
      desktop,
    }) => {
      test.setTimeout(120_000);
      const { electronApp, page } = await launchWithMocks(desktop);
      try {
        await page.evaluate(async (nextTheme) => {
          await window.electronAPI!.store.set('theme', nextTheme);
        }, theme);
        await page.reload();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
          .toBe(theme);
        await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].setContentSize(1024, 768);
          ipcMain.removeHandler('app:getUpdateStatus');
          ipcMain.handle(
            'app:getUpdateStatus',
            () =>
              new Promise((resolve) => {
                (globalThis as any).__UPDATER_INITIAL__ = resolve;
              })
          );
          ipcMain.removeHandler('app:installUpdate');
          ipcMain.handle('app:installUpdate', () => false);
          ipcMain.removeHandler('app:checkForUpdates');
          ipcMain.handle('app:checkForUpdates', () => ({
            available: true,
            version: '1.1.21',
            snapshot: {
              status: 'ready',
              checking: false,
              available: true,
              progress: 100,
              version: '1.1.21',
            },
          }));
        });
        await page.getByRole('link', { name: 'Settings', exact: true }).click();
        await page
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('button', { name: 'Updates', exact: true })
          .click();
        const updates = page.getByRole('region', { name: 'Updates', exact: true });
        await expect(
          updates.getByText('Check for updates to see if a newer version is available.')
        ).toBeVisible();
        await expect(updates.getByText("You're on the latest version")).toHaveCount(0);
        await expect
          .poll(() => electronApp.evaluate(() => typeof (globalThis as any).__UPDATER_INITIAL__))
          .toBe('function');
        // A check that reuses a ready download emits no new native event.
        // Its response must retain the restart action while the initial lookup waits.
        await updates.getByRole('button', { name: 'Check for Updates', exact: true }).click();
        await expect(updates.getByText('Version 1.1.21 ready to install')).toBeVisible();
        await electronApp.evaluate(() => {
          (globalThis as any).__UPDATER_INITIAL__({
            status: 'idle',
            checking: false,
            available: false,
            progress: 0,
          });
          delete (globalThis as any).__UPDATER_INITIAL__;
        });
        await expect(
          updates.getByRole('button', { name: 'Restart to Update', exact: true })
        ).toBeEnabled();
        await updates.getByRole('button', { name: 'Restart to Update', exact: true }).click();
        await expect(updates.getByRole('alert')).toHaveText(
          'Unable to restart for the update. Please try again.'
        );
        await expect(
          updates.getByRole('button', { name: 'Restart to Update', exact: true })
        ).toBeEnabled();
        expect(
          (
            await new AxeBuilder({ page })
              .include('[aria-labelledby="update-settings-heading"]')
              .analyze()
          ).violations
        ).toEqual([]);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/updater-ready-${theme}.png`,
          animations: 'disabled',
        });
        await electronApp.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].webContents.send('updater:progress', {
            percent: 63,
            bytesPerSecond: 1048576,
            total: 104857600,
            transferred: 66060288,
          });
        });
        await expect(updates.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
          'aria-valuenow',
          '63'
        );
        await expect(
          updates.getByRole('button', { name: 'Check for Updates', exact: true })
        ).toBeDisabled();
        expect(
          (
            await new AxeBuilder({ page })
              .include('[aria-labelledby="update-settings-heading"]')
              .analyze()
          ).violations
        ).toEqual([]);
        const overflow = await updates.evaluate(
          (element) => element.scrollWidth - element.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(1);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/updater-${theme}.png`,
          animations: 'disabled',
        });
        await electronApp.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].webContents.send('updater:not-available');
        });
        await expect(updates.getByText("You're on the latest version")).toBeVisible();
        await expect(updates.getByRole('alert')).toHaveCount(0);
      } finally {
        await electronApp.close();
      }
    });
  }

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
