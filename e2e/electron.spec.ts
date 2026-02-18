import { spawnSync } from 'child_process';
import { test, expect, _electron as electron, Page } from '@playwright/test';

const hasDisplay = (() => {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return true;
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }
  const result = spawnSync('xdpyinfo', [], { stdio: 'ignore' });
  return result.status === 0;
})();

const mockTenant = { id: 'tenant_1', name: 'Test Tenant' };
const mockBrand = { id: 'brand_1', name: 'Demo Brand' };
const electronArgs = ['.'];
if (process.platform === 'linux') {
  electronArgs.push(
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer'
  );
}
const electronEnv = {
  ...process.env,
  NODE_ENV: 'development',
  E2E_TEST: 'true',
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

async function ensureElectronAvailable() {
  if (!hasDisplay) {
    test.skip(true, 'Electron UI tests require a display (set DISPLAY or use Xvfb).');
  }

  try {
    const electronApp = await electron.launch({ args: electronArgs, env: electronEnv });
    await electronApp.close();
  } catch (error) {
    test.skip(true, 'Electron failed to launch in this environment.');
  }
}

async function launchWithMocks() {
  const electronApp = await electron.launch({
    args: electronArgs,
    env: electronEnv,
  });

  const page = await electronApp.firstWindow();
  await page.waitForURL('http://localhost:5173/**', { timeout: 120000 });

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

  await page.getByRole('button', { name: 'API Key' }).click();
  await page.getByLabel('API Key').fill('sk-test');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('heading', { name: 'Agent Dashboard' })).toBeVisible();

  return { electronApp, page };
}

test.describe('Electron UI', () => {
  test.beforeAll(async () => {
    await ensureElectronAvailable();
  });

  test('login reaches the dashboard', async () => {
    const { electronApp, page } = await launchWithMocks();

    try {
      await expect(page.getByText('No agent sessions yet')).toBeVisible();
    } finally {
      await electronApp.close();
    }
  });

  test('settings toggles persist', async () => {
    const { electronApp, page } = await launchWithMocks();

    try {
      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

      const minimizeToggle = page.getByLabel('Minimize to System Tray');
      const desktopToggle = page.getByLabel('Desktop Notifications');
      const soundToggle = page.getByLabel('Sound Alerts');

      if (await minimizeToggle.isChecked()) {
        await minimizeToggle.focus();
        await page.keyboard.press('Space');
      }
      if (await desktopToggle.isChecked()) {
        await desktopToggle.focus();
        await page.keyboard.press('Space');
      }
      if (await soundToggle.isChecked()) {
        await soundToggle.focus();
        await page.keyboard.press('Space');
      }

      await expect(minimizeToggle).not.toBeChecked();
      await expect(desktopToggle).not.toBeChecked();
      await expect(soundToggle).not.toBeChecked();

      await page.getByLabel('Theme').selectOption('light');

      await expect
        .poll(async () => {
          return page.evaluate(async () => {
            const api = (window as any).electronAPI;
            return {
              theme: await api.store.get('theme'),
              minimizeToTray: await api.store.get('minimizeToTray'),
              desktopNotifications: await api.store.get('desktopNotifications'),
              soundAlerts: await api.store.get('soundAlerts'),
              appliedTheme: document.documentElement.dataset.theme,
            };
          });
        })
        .toMatchObject({
          theme: 'light',
          minimizeToTray: false,
          desktopNotifications: false,
          soundAlerts: false,
          appliedTheme: 'light',
        });

      // Restore defaults for subsequent tests that rely on persisted preferences.
      await page.getByLabel('Theme').selectOption('dark');

      if (!(await minimizeToggle.isChecked())) {
        await minimizeToggle.focus();
        await page.keyboard.press('Space');
      }
      if (!(await desktopToggle.isChecked())) {
        await desktopToggle.focus();
        await page.keyboard.press('Space');
      }
      if (!(await soundToggle.isChecked())) {
        await soundToggle.focus();
        await page.keyboard.press('Space');
      }

      await expect
        .poll(async () => {
          return page.evaluate(async () => {
            const api = (window as any).electronAPI;
            return {
              theme: await api.store.get('theme'),
              minimizeToTray: await api.store.get('minimizeToTray'),
              desktopNotifications: await api.store.get('desktopNotifications'),
              soundAlerts: await api.store.get('soundAlerts'),
              appliedTheme: document.documentElement.dataset.theme,
            };
          });
        })
        .toMatchObject({
          theme: 'dark',
          minimizeToTray: true,
          desktopNotifications: true,
          soundAlerts: true,
          appliedTheme: 'dark',
        });
    } finally {
      await electronApp.close();
    }
  });
});
