/**
 * Visual Regression Tests
 *
 * Uses Playwright's built-in screenshot comparison for visual regression testing.
 * Screenshots are stored in e2e/__screenshots__ directory.
 *
 * Run with: npm run test:e2e
 * Update snapshots with: npm run test:e2e -- --update-snapshots
 */

import type { ElectronApplication, Page } from '@playwright/test';
import { installDesktopApiFixture } from './api-fixture';
import { test, expect, requireDesktopDisplay, type DesktopHarness } from './desktop';

async function setTestDefaults(page: Page) {
  await page.evaluate(async () => {
    const api = (window as any).electronAPI;
    if (!api?.store) {
      return;
    }
    await Promise.all([api.store.set('onboardingCompleted', true), api.store.set('theme', 'dark')]);
  });
}

test.beforeAll(async () => {
  requireDesktopDisplay();
});

const FIXTURE_TIME = '2026-10-15T16:00:00.000Z';

async function configureVisualClock(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  await page.clock.setFixedTime(FIXTURE_TIME);
}

const mockTenant = { id: 'tenant_1', name: 'Test Tenant', slug: 'test-tenant', tier: 'pro' };
const mockBrand = {
  id: 'brand_1',
  name: 'Demo Brand',
  slug: 'demo',
  tenant_id: 'tenant_1',
  enabled: true,
};

const mockSessions = [
  {
    id: 'session_1',
    tenant_id: 'tenant_1',
    brand_id: 'brand_1',
    agent_type: 'response',
    status: 'running',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      mcp_servers: [],
      model: 'claude-3-opus',
      temperature: 0.7,
    },
    metrics: {
      loop_count: 42,
      tokens_used: 15000,
      tool_calls: 128,
      errors: 0,
      messages_sent: 50,
      uptime_seconds: 3600,
    },
    created_at: '2026-10-15T15:00:00.000Z',
    updated_at: '2026-10-15T15:59:00.000Z',
    started_at: '2026-10-15T15:00:00.000Z',
  },
  {
    id: 'session_2',
    tenant_id: 'tenant_1',
    brand_id: 'brand_1',
    agent_type: 'response',
    status: 'stopped',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 30,
      pause_on_error: false,
      mcp_servers: [],
      model: 'claude-3-sonnet',
      temperature: 0.5,
    },
    metrics: {
      loop_count: 10,
      tokens_used: 5000,
      tool_calls: 30,
      errors: 1,
      messages_sent: 15,
      uptime_seconds: 600,
    },
    created_at: '2026-10-15T14:00:00.000Z',
    updated_at: '2026-10-15T15:55:00.000Z',
  },
  {
    id: 'session_3',
    tenant_id: 'tenant_1',
    brand_id: 'brand_1',
    agent_type: 'response',
    status: 'failed',
    config: {
      loop_interval_ms: 1000,
      max_iterations: 100,
      iteration_timeout_secs: 30,
      pause_on_error: true,
      mcp_servers: [],
      model: 'claude-3-haiku',
      temperature: 0.3,
    },
    metrics: {
      loop_count: 5,
      tokens_used: 1000,
      tool_calls: 8,
      errors: 3,
      messages_sent: 5,
      uptime_seconds: 120,
    },
    created_at: '2026-10-15T13:00:00.000Z',
    updated_at: '2026-10-15T15:50:00.000Z',
  },
];

async function launchWithMocks(
  desktop: DesktopHarness
): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const electronApp = await desktop.launch();

  const page = await electronApp.firstWindow();
  page.on('pageerror', (error) => {
    console.error('Page error:', error);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error('Console error:', message.text());
    }
  });
  await page.waitForURL('http://localhost:5173/**', { timeout: 120000 });
  await configureVisualClock(page);
  await installDesktopApiFixture(electronApp, page, {
    tenant: mockTenant,
    brand: mockBrand,
    sessions: mockSessions,
    platforms: ['shopify', 'gorgias'],
  });

  // Wait for Electron API and login
  await page.waitForFunction(() => (window as any).electronAPI !== undefined);
  await setTestDefaults(page);
  await page.evaluate(async () => {
    const api = (window as any).electronAPI;
    await api.auth.clearApiKey();
  });
  await page.reload();

  // Login via E2E auth hook to keep visuals deterministic.
  await expect(page.getByText('Welcome back')).toBeVisible();
  await page.evaluate(
    ({ tenant, brand }) => {
      (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
    },
    { tenant: mockTenant, brand: mockBrand }
  );
  await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
  await page.getByLabel('API Key').fill('sk-test-visual');
  const signInButton = page.getByRole('button', { name: 'Sign In' });
  await expect(signInButton).toBeEnabled();
  await signInButton.click({ force: true });
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

test.describe('Visual Regression Tests', () => {
  test.describe.configure({ mode: 'serial' });

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async ({ desktop }) => {
    const result = await launchWithMocks(desktop);
    electronApp = result.electronApp;
    page = result.page;
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('Login page appearance', async () => {
    // Navigate to a fresh login state
    await page.evaluate(async () => {
      await (window as any).electronAPI.auth.clearApiKey();
    });
    await page.reload();
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Wait for animations to settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Re-login for subsequent tests
    await page.evaluate(
      ({ tenant, brand }) => {
        (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
      },
      { tenant: mockTenant, brand: mockBrand }
    );
    await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
    await page.getByLabel('API Key').fill('sk-test-visual');
    const signInButton = page.getByRole('button', { name: 'Sign In' });
    await expect(signInButton).toBeEnabled();
    await signInButton.click({ force: true });
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
  });

  test('Dashboard with agents', async () => {
    // Wait for data to load
    await expect(
      page.getByRole('list', { name: 'Agent sessions' }).getByRole('listitem')
    ).toHaveCount(3);
    await expect(page.getByText('Cannot reach StateSet API', { exact: true })).toHaveCount(0);

    await expect(page).toHaveScreenshot('dashboard-with-agents.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('Dashboard stats cards', async () => {
    const statsSection = page.locator('.grid.grid-cols-2.lg\\:grid-cols-4');
    await expect(statsSection).toBeVisible();

    await expect(statsSection).toHaveScreenshot('dashboard-stats.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('Dashboard search and filter', async () => {
    // Focus search
    await page.getByPlaceholder('Search agents...').click();
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot('dashboard-search-focused.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Click a filter button
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot('dashboard-filter-running.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Reset filter
    await page.getByRole('button', { name: 'All', exact: true }).click();
  });

  test('Settings page appearance', async () => {
    await page.getByRole('link', { name: 'Settings' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('settings-page.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('Settings light theme', async () => {
    await page.getByRole('link', { name: 'Settings' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Switch to light theme
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByRole('button', { name: 'Light theme', exact: true }).click();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('settings-light-theme.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Switch back to dark theme
    await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
    await page.waitForTimeout(300);
  });

  test('Connections page appearance', async () => {
    await page.getByRole('link', { name: 'Connections' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Platform Connections' })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('connections-page.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('Command palette appearance', async () => {
    // Go back to dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click({ force: true });
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    // Open command palette
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('command-palette.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Close command palette
    await page.keyboard.press('Escape');
  });

  test('Cleanup confirmation appearance', async () => {
    const trigger = page.getByRole('button', { name: 'Clean Up', exact: true });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete stopped agents?' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Delete 2 agents', exact: true })
    ).toBeVisible();
    await expect(page).toHaveScreenshot('cleanup-confirmation.png', { animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('list', { name: 'Agent sessions' }).getByRole('listitem')
    ).toHaveCount(3);
  });

  test('Create agent dialog', async () => {
    // Click new agent button
    await page.getByRole('button', { name: 'New Agent' }).click();
    await page.waitForTimeout(300);

    // Take screenshot of the dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page).toHaveScreenshot('create-agent-dialog.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });

    // Close dialog
    await page.keyboard.press('Escape');
  });
});

test.describe('Responsive Visual Tests', () => {
  test('Dashboard at different viewport sizes', async ({ desktop }) => {
    const electronApp = await desktop.launch();

    try {
      const page = await electronApp.firstWindow();
      await page.waitForURL('http://localhost:5173/**', { timeout: 120000 });
      await configureVisualClock(page);

      await installDesktopApiFixture(electronApp, page, {
        tenant: mockTenant,
        brand: mockBrand,
        sessions: mockSessions,
      });

      await page.waitForFunction(() => (window as any).electronAPI !== undefined);
      await setTestDefaults(page);
      await page.evaluate(async () => {
        const api = (window as any).electronAPI;
        await api.auth.clearApiKey();
      });
      await page.reload();

      await expect(page.getByText('Welcome back')).toBeVisible();
      await page.evaluate(
        ({ tenant, brand }) => {
          (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
        },
        { tenant: mockTenant, brand: mockBrand }
      );
      await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
      await page.getByLabel('API Key').fill('sk-test-token');
      const signInButton = page.getByRole('button', { name: 'Sign In' });
      await expect(signInButton).toBeEnabled();
      await signInButton.click({ force: true });
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();

      // Test different viewport sizes
      const viewports = [
        { width: 1920, height: 1080, name: 'desktop-large' },
        { width: 1440, height: 900, name: 'desktop-medium' },
        { width: 1280, height: 720, name: 'desktop-small' },
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);

        await expect(page).toHaveScreenshot(`dashboard-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
      }
    } finally {
      await electronApp?.close();
    }
  });
});
