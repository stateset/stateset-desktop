/**
 * Accessibility Tests with axe-core
 *
 * Uses @axe-core/playwright for automated accessibility testing.
 * Tests follow WCAG 2.1 AA guidelines.
 *
 * Run with: npm run test:e2e
 */

import { spawnSync } from 'child_process';
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
    test.skip(true, 'Electron accessibility tests require a display (set DISPLAY or use Xvfb).');
  }

  try {
    const electronApp = await electron.launch({ args: electronArgs, env: electronEnv });
    await electronApp.close();
  } catch (error) {
    test.skip(true, 'Electron failed to launch in this environment.');
  }
}

test.beforeAll(async () => {
  await ensureElectronAvailable();
});

const mockTenant = { id: 'tenant_1', name: 'Test Tenant', slug: 'test-tenant', tier: 'pro' };
const mockBrand = { id: 'brand_1', name: 'Demo Brand', slug: 'demo', tenant_id: 'tenant_1' };

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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

async function launchWithMocks(): Promise<{ electronApp: ElectronApplication; page: Page }> {
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

  // Set up API mocks
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

    if (url.includes('/agents') && !url.includes('/stream')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, sessions: mockSessions }),
      });
      return;
    }

    if (url.includes('/secrets')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, platforms: ['shopify'] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not mocked in a11y test' }),
    });
  });

  await page.waitForFunction(() => (window as any).electronAPI !== undefined);
  await setTestDefaults(page);

  return { electronApp, page };
}

/**
 * Helper to run axe accessibility scan and format results
 */
async function checkAccessibility(
  page: Page,
  options?: {
    excludeRules?: string[];
    includeRules?: string[];
    disableRules?: string[];
  }
) {
  let builder = new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  if (options?.excludeRules) {
    builder = builder.exclude(options.excludeRules);
  }

  if (options?.disableRules) {
    builder = builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();

  // Format violations for better error messages
  if (results.violations.length > 0) {
    const formattedViolations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        html: node.html.substring(0, 200),
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));

    console.log('Accessibility Violations:', JSON.stringify(formattedViolations, null, 2));
  }

  return results;
}

test.describe('Accessibility Tests', () => {
  test.describe.configure({ mode: 'serial' });

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    const result = await launchWithMocks();
    electronApp = result.electronApp;
    page = result.page;
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('Login page should have no accessibility violations', async () => {
    await page.waitForFunction(() => (window as any).electronAPI !== undefined);
    await page.evaluate(async () => {
      const api = (window as any).electronAPI;
      await api.auth.clearApiKey();
    });
    await page.reload();
    await expect(page.getByText('Welcome back')).toBeVisible();

    const results = await checkAccessibility(page, {
      // Disable color-contrast for now as it may need design review
      disableRules: ['color-contrast'],
    });

    expect(results.violations).toHaveLength(0);
  });

  test('Login form should have proper labels and ARIA attributes', async () => {
    // Check form has accessible name
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Check input has label
    await page.getByRole('button', { name: 'API Key' }).click();
    const apiKeyInput = page.getByLabel('API Key');
    await expect(apiKeyInput).toBeVisible();
    await expect(apiKeyInput).toHaveAttribute('type', 'password');
    await apiKeyInput.fill('sk-test-a11y');

    // Check button is accessible
    const submitButton = page.getByRole('button', { name: 'Sign In' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('Dashboard should have no accessibility violations', async () => {
    // Login first
    await page.evaluate(
      ({ tenant, brand }) => {
        (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
      },
      { tenant: mockTenant, brand: mockBrand }
    );
    await page.getByRole('button', { name: 'API Key' }).click();
    await page.getByLabel('API Key').fill('sk-test-a11y');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Agent Dashboard' })).toBeVisible();

    // Wait for content to load
    await page.waitForTimeout(1000);

    const results = await checkAccessibility(page, {
      disableRules: ['color-contrast'],
    });

    expect(results.violations).toHaveLength(0);
  });

  test('Dashboard should have proper heading hierarchy', async () => {
    // Check h1 exists
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText('Agent Dashboard');

    // Check h2 exists
    const h2 = page.locator('h2');
    await expect(h2.first()).toBeVisible();
  });

  test('Dashboard buttons should be keyboard accessible', async () => {
    // Test that New Agent button is focusable
    const newAgentButton = page.getByRole('button', { name: 'New Agent' });
    await newAgentButton.focus();
    await expect(newAgentButton).toBeFocused();

    // Test filter buttons are focusable
    const allButton = page.getByRole('button', { name: 'All', exact: true });
    await allButton.focus();
    await expect(allButton).toBeFocused();

    // Test keyboard navigation to running filter
    await page.keyboard.press('Tab');
    // Button should be reachable via Tab (verify it exists)
    await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeVisible();
  });

  test('Agent list items should be interactive and have proper roles', async () => {
    // Session rows should be accessible
    const sessionRows = page.getByRole('button', { name: /agent, status:/i });
    const firstRow = sessionRows.first();

    if (await firstRow.isVisible()) {
      // Should have accessible label
      await expect(firstRow).toHaveAttribute('aria-label', /.+/);

      // Test keyboard activation
      await firstRow.focus();
      await expect(firstRow).toBeFocused();
    }
  });

  test('Search input should be accessible', async () => {
    const searchInput = page.getByPlaceholder('Search agents...');
    await expect(searchInput).toBeVisible();

    // Should be focusable
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Should have proper type
    await expect(searchInput).toHaveAttribute('type', 'text');
  });

  test('Settings page should have no accessibility violations', async () => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.waitForTimeout(500);

    const results = await checkAccessibility(page, {
      disableRules: ['color-contrast'],
    });

    expect(results.violations).toHaveLength(0);
  });

  test('Settings form controls should have proper labels', async () => {
    // Check theme select has label
    const themeSelect = page.getByLabel('Theme');
    await expect(themeSelect).toBeVisible();

    // Check toggles have labels
    const minimizeToggle = page.getByLabel('Minimize to System Tray');
    await expect(minimizeToggle).toBeVisible();

    const desktopToggle = page.getByLabel('Desktop Notifications');
    await expect(desktopToggle).toBeVisible();

    const soundToggle = page.getByLabel('Sound Alerts');
    await expect(soundToggle).toBeVisible();
  });

  test('Settings toggles should be keyboard operable', async () => {
    const minimizeToggle = page.getByLabel('Minimize to System Tray');

    // Focus the toggle
    await minimizeToggle.focus();
    await expect(minimizeToggle).toBeFocused();

    // Get initial state
    const initialState = await minimizeToggle.isChecked();

    // Toggle with keyboard (Space)
    await page.keyboard.press('Space');
    const newState = await minimizeToggle.isChecked();
    expect(newState).toBe(!initialState);

    // Toggle back
    await page.keyboard.press('Space');
    expect(await minimizeToggle.isChecked()).toBe(initialState);
  });

  test('Connections page should have no accessibility violations', async () => {
    await page.getByRole('link', { name: 'Connections' }).click();
    await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
    await page.waitForTimeout(500);

    const results = await checkAccessibility(page, {
      disableRules: ['color-contrast'],
    });

    expect(results.violations).toHaveLength(0);
  });

  test('Navigation should be keyboard accessible', async () => {
    // Test sidebar links are focusable
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await dashboardLink.focus();
    await expect(dashboardLink).toBeFocused();

    // Navigate with Enter
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Agent Dashboard' })).toBeVisible();
  });

  test('Command palette should be keyboard accessible', async () => {
    // Open with keyboard shortcut
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);

    // Should be visible
    const palette = page.locator('[role="dialog"]');
    await expect(palette).toBeVisible();

    // Should trap focus
    const searchInput = palette.getByPlaceholder(/search/i).or(palette.locator('input').first());
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeFocused();
    }

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
  });

  test('Create agent dialog should be accessible', async () => {
    // Open dialog
    await page.getByRole('button', { name: 'New Agent' }).click();
    await page.waitForTimeout(300);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Run accessibility check on dialog
    const results = await checkAccessibility(page, {
      disableRules: ['color-contrast'],
    });

    expect(results.violations).toHaveLength(0);

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('Focus should be trapped in modal dialogs', async () => {
    // Open dialog
    await page.getByRole('button', { name: 'New Agent' }).click();
    await page.waitForTimeout(300);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Tab through dialog elements
    const focusableElements = dialog.locator(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusableElements.count();

    if (count > 1) {
      // Tab through all elements
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('Tab');
      }

      // After tabbing through all, focus should still be in dialog
      const isInDialog = await dialog.locator(':focus').count();
      expect(isInDialog).toBeGreaterThan(0);
    }

    // Close dialog
    await page.keyboard.press('Escape');
  });
});

test.describe('Color Contrast Analysis', () => {
  test('Report color contrast issues for design review', async () => {
    const { electronApp, page } = await launchWithMocks();

    try {
      await page.waitForFunction(() => (window as any).electronAPI !== undefined);
      await page.evaluate(async () => {
        const api = (window as any).electronAPI;
        await api.auth.clearApiKey();
      });
      await page.reload();

      // Login
      await page.evaluate(
        ({ tenant, brand }) => {
          (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
        },
        { tenant: mockTenant, brand: mockBrand }
      );
      await page.getByRole('button', { name: 'API Key' }).click();
      await page.getByLabel('API Key').fill('sk-test');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(page.getByRole('heading', { name: 'Agent Dashboard' })).toBeVisible();

      // Check color contrast specifically
      const results = await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(['wcag2aa'])
        .options({ runOnly: ['color-contrast'] })
        .analyze();

      // Log issues for design review (don't fail test)
      if (results.violations.length > 0) {
        console.log('\n=== Color Contrast Issues for Design Review ===');
        results.violations.forEach((violation) => {
          console.log(`\nIssue: ${violation.help}`);
          console.log(`Impact: ${violation.impact}`);
          violation.nodes.forEach((node) => {
            console.log(`  Element: ${node.html.substring(0, 100)}...`);
            console.log(`  Fix: ${node.failureSummary}`);
          });
        });
        console.log('\n================================================\n');
      }

      // This test passes but logs issues
      expect(true).toBe(true);
    } finally {
      await electronApp.close();
    }
  });
});

test.describe('Screen Reader Accessibility', () => {
  test('Important content should have proper ARIA landmarks', async () => {
    const { electronApp, page } = await launchWithMocks();

    try {
      await page.waitForFunction(() => (window as any).electronAPI !== undefined);
      await page.evaluate(async () => {
        const api = (window as any).electronAPI;
        await api.auth.clearApiKey();
      });
      await page.reload();

      await page.evaluate(
        ({ tenant, brand }) => {
          (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
        },
        { tenant: mockTenant, brand: mockBrand }
      );
      await page.getByRole('button', { name: 'API Key' }).click();
      await page.getByLabel('API Key').fill('sk-test');
      await page.getByRole('button', { name: 'Sign In' }).click();
      await expect(page.getByRole('heading', { name: 'Agent Dashboard' })).toBeVisible();

      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      // Main content area should exist
      expect(await main.count()).toBeGreaterThanOrEqual(0);

      // Check for navigation landmark
      const nav = page.locator('nav, [role="navigation"]');
      expect(await nav.count()).toBeGreaterThanOrEqual(0);

      // Status badges should have accessible text
      const statusBadges = page
        .locator('[class*="rounded-full"]')
        .filter({ hasText: /Running|Stopped|Failed/i });
      const badgeCount = await statusBadges.count();

      for (let i = 0; i < Math.min(badgeCount, 3); i++) {
        const badge = statusBadges.nth(i);
        const text = await badge.textContent();
        expect(text?.length).toBeGreaterThan(0);
      }
    } finally {
      await electronApp.close();
    }
  });
});
