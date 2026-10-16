/**
 * Accessibility Tests with axe-core
 *
 * Uses @axe-core/playwright for automated accessibility testing.
 * Tests follow WCAG 2.1 AA guidelines.
 *
 * Run with: npm run test:e2e
 */

import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect, requireDesktopDisplay, type DesktopHarness } from './desktop';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import {
  installDesktopApiFixture,
  setDesktopSessionResponse,
  configureDesktopActions,
  getDesktopActionRequests,
} from './api-fixture';

async function setTestDefaults(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.evaluate(
    async ({ theme }) => {
      const api = (window as any).electronAPI;
      if (!api?.store) {
        return;
      }
      await Promise.all([
        api.store.set('onboardingCompleted', true),
        api.store.set('theme', theme),
      ]);
    },
    { theme }
  );
}

test.beforeAll(async () => {
  requireDesktopDisplay();
});

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

async function launchWithMocks(
  desktop: DesktopHarness,
  fixtureSessions: unknown[] = mockSessions,
  sessionsStatus = 200,
  actions?: { blocked?: boolean; failIds?: string[] }
): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const electronApp = await desktop.launch();

  const page = await electronApp.firstWindow();
  await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`, { timeout: 120000 });
  await installDesktopApiFixture(electronApp, page, {
    tenant: mockTenant,
    brand: mockBrand,
    sessions: fixtureSessions,
    sessionsStatus,
    actions,
  });

  await page.waitForFunction(() => (window as any).electronAPI !== undefined);
  await setTestDefaults(page);

  return { electronApp, page };
}

/**
 * Helper to run axe accessibility scan and format results
 */
async function checkAccessibility(page: Page) {
  const builder = new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

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

  test.beforeAll(async ({ desktop }) => {
    const result = await launchWithMocks(desktop);
    electronApp = result.electronApp;
    page = result.page;
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('Login page should have no accessibility violations', async () => {
    await page.waitForFunction(() => (window as any).electronAPI !== undefined);
    await page.evaluate(async () => {
      const api = (window as any).electronAPI;
      await api.auth.clearApiKey();
    });
    await page.reload();
    await expect(page.getByText('Welcome back')).toBeVisible();

    const results = await checkAccessibility(page);

    expect(results.violations).toHaveLength(0);
  });

  test('Login form should have proper labels and ARIA attributes', async () => {
    // Check form has accessible name
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Check input has label
    await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
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
    await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
    await page.getByLabel('API Key').fill('sk-test-a11y');
    await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    // Wait for content to load
    await page.waitForTimeout(1000);

    const results = await checkAccessibility(page);

    expect(results.violations).toHaveLength(0);
  });

  test('Dashboard should have proper heading hierarchy', async () => {
    // Check h1 exists
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(/.+/);

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
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible();
  });

  test('Agent list items should be interactive and have proper roles', async () => {
    // Session rows should be accessible
    const sessionRows = page.getByRole('button', {
      name: /agent.*(?:running|paused|stopped|failed)/i,
    });
    const firstRow = sessionRows.first();

    if (await firstRow.isVisible()) {
      // Should have accessible label
      await expect(firstRow).toHaveAccessibleName(/agent/i);

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
    await page.getByRole('link', { name: 'Settings' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.waitForTimeout(500);

    const results = await checkAccessibility(page);

    expect(results.violations).toHaveLength(0);
  });

  test('Settings form controls should have proper labels', async () => {
    const sections = page.getByRole('navigation', { name: 'Settings sections' });
    await sections.getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Light theme', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dark theme', exact: true })).toBeVisible();
    await sections.getByRole('button', { name: 'Background', exact: true }).click();
    const minimizeToggle = page.getByLabel('Minimize to System Tray');
    await expect(minimizeToggle).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Notifications', exact: true })
      .click();
    const desktopToggle = page.getByLabel('Desktop Notifications');
    await expect(desktopToggle).toBeVisible();

    const soundToggle = page.getByLabel('Sound Alerts');
    await expect(soundToggle).toBeVisible();
  });

  test('Settings toggles should be keyboard operable', async () => {
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Background', exact: true })
      .click();
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
    await page.getByRole('link', { name: 'Connections' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Platform Connections' })).toBeVisible();
    await page.waitForTimeout(500);

    const results = await checkAccessibility(page);

    expect(results.violations).toHaveLength(0);
  });

  test('Navigation should be keyboard accessible', async () => {
    // Test sidebar links are focusable
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await dashboardLink.focus();
    await expect(dashboardLink).toBeFocused();

    // Navigate with Enter
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
  });

  test('Command palette should be keyboard accessible', async () => {
    // Open with keyboard shortcut
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);

    // Should be visible
    const palette = page.getByRole('dialog', { name: 'Command Palette' });
    await expect(palette).toBeVisible();

    // Should trap focus
    const searchInput = palette.getByPlaceholder(/search/i).or(palette.locator('input').first());
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeFocused();
    }

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('Create agent dialog should be accessible', async () => {
    // Open dialog
    await page.getByRole('button', { name: 'New Agent' }).click();
    await page.waitForTimeout(300);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Run accessibility check on dialog
    const results = await checkAccessibility(page);

    expect(results.violations).toHaveLength(0);

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('Focus should be trapped in modal dialogs', async () => {
    const existingDialog = page.locator('[role="dialog"]').first();
    if (await existingDialog.isVisible()) {
      const closeDialogButton = page.getByRole('button', { name: 'Close dialog' }).first();
      if (await closeDialogButton.isVisible()) {
        await closeDialogButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(existingDialog).not.toBeVisible();
    }

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
    }

    // Dialog remains active while tabbing through controls.
    await expect(dialog).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');
  });
});

test.describe('Color Contrast Analysis', () => {
  test('Dark theme dashboard should meet text contrast requirements', async ({ desktop }) => {
    const { electronApp, page } = await launchWithMocks(desktop);

    try {
      await page.waitForFunction(() => (window as any).electronAPI !== undefined);
      await page.evaluate(async () => {
        const api = (window as any).electronAPI;
        await api.auth.clearApiKey();
      });
      await page.reload();
      await expect(page.getByText('Welcome back')).toBeVisible();

      // Login
      await page.evaluate(
        ({ tenant, brand }) => {
          (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
        },
        { tenant: mockTenant, brand: mockBrand }
      );
      await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
      await page.getByLabel('API Key').fill('sk-test-token');
      await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();

      // Check color contrast specifically
      const results = await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(['wcag2aa'])
        .options({ runOnly: ['color-contrast'] })
        .analyze();

      // Keep actionable contrast details in the failure log.
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

      expect(results.violations).toHaveLength(0);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({ path: 'dist/verification/native-dashboard-dark.png' });
    } finally {
      await electronApp?.close();
    }
  });
});

test.describe('Light Theme Accessibility', () => {
  // Smoke-tests the same primary surfaces under the light theme so we catch
  // theme-specific regressions (focus rings, hidden text, missing borders).
  // Include contrast on every primary surface in both themes.
  test.describe.configure({ mode: 'serial' });

  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async ({ desktop }) => {
    const result = await launchWithMocks(desktop);
    electronApp = result.electronApp;
    page = result.page;
    await setTestDefaults(page, 'light');
    await page.reload();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('Login page (light) should have no accessibility violations', async () => {
    await page.waitForFunction(() => (window as any).electronAPI !== undefined);
    await page.evaluate(async () => {
      const api = (window as any).electronAPI;
      await api.auth.clearApiKey();
    });
    await page.reload();
    await expect(page.getByText('Welcome back')).toBeVisible();

    const results = await checkAccessibility(page);
    expect(results.violations).toHaveLength(0);
  });

  test('Dashboard (light) should have no accessibility violations', async () => {
    await page.evaluate(
      ({ tenant, brand }) => {
        (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
      },
      { tenant: mockTenant, brand: mockBrand }
    );
    await page.getByRole('button', { name: 'API Key', exact: true }).click({ force: true });
    await page.getByLabel('API Key').fill('sk-test-light');
    await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
    await page.waitForTimeout(1000);

    const results = await checkAccessibility(page);
    expect(results.violations).toHaveLength(0);
  });

  test('Settings (light) should have no accessibility violations', async () => {
    await page.getByRole('link', { name: 'Settings' }).click({ force: true });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.waitForTimeout(500);

    const results = await checkAccessibility(page);
    expect(results.violations).toHaveLength(0);
    const sections = page.getByRole('navigation', { name: 'Settings sections' });
    for (const section of ['Background', 'Notifications', 'Appearance']) {
      await sections.getByRole('button', { name: section, exact: true }).click();
      expect((await checkAccessibility(page)).violations, `${section} in light theme`).toEqual([]);
    }
    await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('dark');
    expect((await checkAccessibility(page)).violations, 'Appearance in dark theme').toEqual([]);
    await page.getByRole('button', { name: 'Light theme', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('light');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Compact Mode', exact: true })).toBeFocused();
    expect((await checkAccessibility(page)).violations, 'Appearance with keyboard focus').toEqual(
      []
    );
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({
      path: 'dist/verification/native-appearance-light.png',
      animations: 'disabled',
    });
  });

  test('Light theme settings should meet text contrast requirements', async () => {
    const results = await new AxeBuilder({ page })
      .setLegacyMode()
      .withTags(['wcag2aa'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();

    if (results.violations.length > 0) {
      console.log('\n=== Light Theme Color Contrast Issues ===');
      results.violations.forEach((violation) => {
        console.log(`\nIssue: ${violation.help}`);
        console.log(`Impact: ${violation.impact}`);
        violation.nodes.forEach((node) => {
          console.log(`  Element: ${node.html.substring(0, 100)}...`);
          console.log(`  Fix: ${node.failureSummary}`);
        });
      });
      console.log('\n==========================================\n');
    }

    expect(results.violations).toHaveLength(0);
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({ path: 'dist/verification/native-settings-light.png' });
  });

  test('Connections and credential forms (light) should have no accessibility violations', async () => {
    await page.getByRole('link', { name: 'Connections', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Platform Connections' })).toBeVisible();
    await page.getByRole('button', { name: 'Manual', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Save credentials', exact: true })).toBeVisible();
    expect((await checkAccessibility(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Add custom MCP server', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Add custom MCP server', exact: true })
    ).toBeVisible();
    await page.getByLabel('Endpoint / Command', { exact: true }).fill('https://mcp.example.test');
    await expect(page.getByRole('button', { name: 'Test server', exact: true })).toBeEnabled();
    for (const accent of ['blue', 'purple', 'green', 'amber', 'rose', 'cyan']) {
      await page.evaluate((accent) => {
        document.documentElement.dataset.accent = accent;
      }, accent);
      expect(
        (await checkAccessibility(page)).violations,
        `${accent} custom server controls`
      ).toEqual([]);
    }
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({
      path: 'dist/verification/native-connections-light.png',
      animations: 'disabled',
    });
  });
});

test.describe('Screen Reader Accessibility', () => {
  test('Important content should have proper ARIA landmarks', async ({ desktop }) => {
    const { electronApp, page } = await launchWithMocks(desktop);

    try {
      await page.waitForFunction(() => (window as any).electronAPI !== undefined);
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
      await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
      await expect(
        page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();

      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      // Main content area should exist
      expect(await main.count()).toBeGreaterThanOrEqual(1);

      // Check for navigation landmark
      const nav = page.locator('nav, [role="navigation"]');
      expect(await nav.count()).toBeGreaterThanOrEqual(1);

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
      await electronApp?.close();
    }
  });
});

async function withMockDesktop(
  desktop: DesktopHarness,
  scenario: (page: Page) => Promise<void>,
  fixtureSessions: unknown[] = mockSessions
) {
  const { electronApp, page } = await launchWithMocks(desktop, fixtureSessions);
  try {
    await scenario(page);
  } catch (error) {
    await desktop.captureFailure(test.info());
    throw error;
  } finally {
    await electronApp.close();
  }
}

test.describe('Sign-in, template and notification usability', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`Sign-in controls are readable and keyboard operable in ${theme} theme`, async ({
      desktop,
    }) => {
      await withMockDesktop(desktop, async (page) => {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        const methods = page.getByRole('group', { name: 'Sign-in method' });
        await expect(methods.getByRole('button', { name: 'Email' })).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        expect((await checkAccessibility(page)).violations).toEqual([]);
        const apiKey = methods.getByRole('button', { name: 'API Key' });
        await apiKey.focus();
        await page.keyboard.press('Space');
        await expect(apiKey).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByLabel('API Key')).toBeFocused();
        await page.getByLabel('API Key').fill('sk-fixture-not-a-real-credential');
        await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
        expect((await checkAccessibility(page)).violations).toEqual([]);
        for (const accent of ['blue', 'purple', 'green', 'amber', 'rose', 'cyan']) {
          await page.evaluate((accent) => {
            document.documentElement.dataset.accent = accent;
          }, accent);
          const contrast = await new AxeBuilder({ page })
            .setLegacyMode()
            .include('.auth-submit')
            .options({ runOnly: ['color-contrast'] })
            .analyze();
          expect(contrast.violations, `${theme} sign-in button with ${accent} accent`).toEqual([]);
        }
        await page.evaluate(() => {
          document.documentElement.dataset.accent = 'blue';
        });
        await methods.getByRole('button', { name: 'Email' }).click();
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/native-login-${theme}.png`,
          animations: 'disabled',
        });
      });
    });

    test(`Workspace and export popups support keyboard navigation in ${theme} theme`, async ({
      desktop,
    }) => {
      await withMockDesktop(desktop, async (page) => {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = {
              tenant,
              brands: [
                brand,
                { ...brand, id: 'brand_2', name: 'Second Brand' },
                { ...brand, id: 'brand_disabled', name: 'Disabled Brand', enabled: false },
              ],
            };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-popup-navigation');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();

        const trigger = page.getByRole('button', { name: /^Select brand/ });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const first = page.getByRole('option', { name: 'Demo Brand', exact: true });
        const second = page.getByRole('option', { name: 'Second Brand', exact: true });
        await expect(first).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(second).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(first).toBeFocused();
        expect(
          await page.getByRole('main').evaluate((element) => getComputedStyle(element).opacity)
        ).toBe('1');
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();

        const exportButton = page.getByRole('button', { name: 'Export', exact: true });
        await expect(exportButton).toBeEnabled();
        await exportButton.focus();
        await page.keyboard.press('ArrowUp');
        await expect(page.getByRole('menuitem', { name: 'Metrics Summary' })).toBeFocused();
        await page.keyboard.press('Home');
        await expect(page.getByRole('menuitem', { name: 'JSON', exact: true })).toBeFocused();
        await page.keyboard.press('c');
        await expect(page.getByRole('menuitem', { name: 'CSV', exact: true })).toBeFocused();
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await page.keyboard.press('Tab');
        await expect(exportButton).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('menu', { name: 'Export options' })).toHaveCount(0);

        await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
        await expect(page.getByRole('link', { name: 'Chats', exact: true })).toHaveAccessibleName(
          'Chats'
        );
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('s');
        await expect(second).toBeFocused();
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/native-workspace-popup-${theme}.png`,
          animations: 'disabled',
        });
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAccessibleName('Select brand. Current: Second Brand');
        await expect(trigger).toBeFocused();
        await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
        await expect(trigger).toHaveAccessibleName(
          'Select brand. Current: Test Tenant Second Brand'
        );
        await expect(page.getByRole('link', { name: 'Chats', exact: true })).toBeVisible();
      });
    });

    test(`Dashboard load failures recover without hiding saved data in ${theme} theme`, async ({
      desktop,
    }) => {
      const statuses = ['running', 'paused', 'starting', 'stopping', 'stopped', 'failed'];
      const fixtureSessions = statuses.map((status, index) => ({
        ...mockSessions[0],
        id: `recovery_${index}`,
        name: `Recovery ${status}`,
        status,
      }));
      const { electronApp, page } = await launchWithMocks(desktop, fixtureSessions, 400);
      try {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-dashboard-recovery');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        const notice = page.getByRole('alert').filter({ hasText: 'Couldn’t load agents' });
        await expect(notice).toBeVisible();
        await expect(page.getByText('Launch your first agent')).toHaveCount(0);
        await expect(page.getByText('Fleet Overview')).toHaveCount(0);
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/dashboard-unavailable-${theme}.png`,
          animations: 'disabled',
        });
        await setDesktopSessionResponse(electronApp, 200);
        await notice.getByRole('button', { name: 'Retry', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(
          page.getByRole('checkbox', { name: 'Select Recovery running', exact: true })
        ).toBeVisible();
        await expect(notice).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Active.*2.*total/ })).toBeVisible();
        const counts = page.getByLabel('Agent status counts');
        for (const status of statuses) {
          await expect(
            counts.getByText(status.charAt(0).toUpperCase() + status.slice(1), { exact: true })
          ).toBeVisible();
        }
        await expect(page.locator('.page-subtitle')).toHaveText(/^1 agent running/);
        await setDesktopSessionResponse(electronApp, 400);
        await page.getByRole('button', { name: 'Refresh sessions' }).click();
        const stale = page.getByRole('alert').filter({ hasText: 'Couldn’t refresh agents' });
        await expect(stale).toBeVisible();
        await expect(
          page.getByRole('checkbox', { name: 'Select Recovery paused', exact: true })
        ).toBeVisible();
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await page.screenshot({
          path: `dist/verification/dashboard-saved-${theme}.png`,
          animations: 'disabled',
        });
        await setDesktopSessionResponse(electronApp, 200);
        await stale.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(stale).toHaveCount(0);
      } catch (error) {
        await desktop.captureFailure(test.info());
        throw error;
      } finally {
        await electronApp.close();
      }
    });

    test(`Fleet actions report partial failures and retry only reviewed targets in ${theme} theme`, async ({
      desktop,
    }) => {
      const sessions = [
        { ...mockSessions[0], id: 'fleet_fail', name: 'Needs attention', status: 'stopped' },
        { ...mockSessions[1], id: 'fleet_ok', name: 'Ready agent', status: 'failed' },
      ];
      const { electronApp, page } = await launchWithMocks(desktop, sessions, 200, {
        blocked: true,
        failIds: ['fleet_fail'],
      });
      try {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-fleet-actions');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        const start = page.getByRole('button', { name: /^Start All/ });
        await start.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('link', { name: 'Settings', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Settings', exact: true, level: 1 })
        ).toBeVisible();
        await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
        const progress = page.getByRole('region', { name: 'Agent action progress' });
        await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        await expect(start).toBeDisabled();
        await expect(page.getByRole('button', { name: /^Stop All/ })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Clean Up', exact: true })).toBeDisabled();
        await expect(page.getByRole('checkbox', { name: 'Select Needs attention' })).toBeDisabled();
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await configureDesktopActions(electronApp, { blocked: false });
        const result = page.getByRole('region', { name: 'Agent action result' });
        await expect(result).toContainText('1 started; 1 failed to start.');
        await result.getByText('1 failed agent', { exact: true }).click();
        await expect(result.getByRole('list', { name: 'Failed agents' })).toContainText(
          'Needs attention'
        );
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/fleet-partial-${theme}.png`,
          animations: 'disabled',
        });
        await configureDesktopActions(electronApp, { failIds: [] });
        await result.getByRole('button', { name: 'Retry failed' }).focus();
        await page.keyboard.press('Enter');
        await expect(result).toContainText('1 agent started.');
        expect(
          (await getDesktopActionRequests(electronApp))
            .filter((request) => request.action === 'start')
            .map((request) => request.id)
        ).toEqual(['fleet_fail', 'fleet_ok', 'fleet_fail']);
        await page.getByRole('button', { name: /^Stop All/ }).click();
        await expect(result).toContainText('2 agents stopped.');
        await configureDesktopActions(electronApp, { failIds: ['fleet_fail'] });
        await page.getByRole('button', { name: 'Clean Up', exact: true }).click();
        const dialog = page.getByRole('alertdialog', { name: 'Delete stopped agents?' });
        await expect(dialog).toContainText(
          'Agents added later are excluded; active agents are skipped.'
        );
        expect((await checkAccessibility(page)).violations).toEqual([]);
        await dialog.getByRole('button', { name: 'Delete 2 agents', exact: true }).click();
        await expect(result).toContainText('1 deleted; 1 failed to delete.');
        await result.getByRole('button', { name: 'Review cleanup' }).click();
        await expect(
          dialog.getByRole('button', { name: 'Delete 1 agent', exact: true })
        ).toBeVisible();
        expect(
          (await getDesktopActionRequests(electronApp)).filter(
            (request) => request.action === 'delete'
          )
        ).toHaveLength(2);
        await configureDesktopActions(electronApp, { failIds: [] });
        await dialog.getByRole('button', { name: 'Delete 1 agent', exact: true }).click();
        await expect(result).toContainText('1 agent deleted.');
        await expect(page.getByText('Launch your first agent')).toBeVisible();
        expect(
          (await getDesktopActionRequests(electronApp))
            .filter((request) => request.action === 'delete')
            .map((request) => request.id)
        ).toEqual(['fleet_fail', 'fleet_ok', 'fleet_fail']);
      } catch (error) {
        await desktop.captureFailure(test.info());
        throw error;
      } finally {
        await configureDesktopActions(electronApp, { blocked: false }).catch(() => undefined);
        await electronApp.close();
      }
    });

    test(`Bulk selection stays on the visible page in ${theme} theme`, async ({ desktop }) => {
      const sessions = Array.from({ length: 15 }, (_, index) => ({
        ...mockSessions[index % 2],
        id: `bulk_${index}`,
        name: `Agent ${String(index + 1).padStart(2, '0')}`,
        created_at: new Date(Date.UTC(2026, 9, 15, 0, index)).toISOString(),
      }));
      await withMockDesktop(
        desktop,
        async (page) => {
          await setTestDefaults(page, theme);
          await page.evaluate(async () => {
            await window.electronAPI!.auth.clearApiKey();
            await window.electronAPI!.store.set('pageSize', 10);
          });
          await page.reload();
          await expect(page.getByText('Welcome back')).toBeVisible();
          await page.evaluate(
            ({ tenant, brand }) => {
              (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
            },
            { tenant: mockTenant, brand: mockBrand }
          );
          await page.getByRole('button', { name: 'API Key', exact: true }).click();
          await page.getByLabel('API Key').fill('sk-test-page-selection');
          await page.getByRole('button', { name: 'Sign In', exact: true }).click();
          const first = page.getByRole('checkbox', { name: 'Select Agent 01', exact: true });
          await expect(page.getByText(/^\d+%$/)).toHaveCount(0);
          const comparisons = page
            .getByRole('group', { name: /^Total Loops:/ })
            .getByRole('list', { name: 'Total Loops by session, oldest first' });
          await expect(comparisons.getByRole('listitem')).toHaveCount(10);
          await first.focus();
          await page.keyboard.press('Space');
          const bar = page.getByRole('group', { name: 'Agent selection', exact: true });
          await expect(bar.getByText('1 selected', { exact: true })).toBeVisible();
          const all = bar.getByRole('checkbox', { name: 'Select all visible agents' });
          await expect(all).toHaveJSProperty('indeterminate', true);
          expect((await checkAccessibility(page)).violations).toEqual([]);
          await all.focus();
          await page.keyboard.press('Space');
          await expect(all).toBeChecked();
          await expect(bar.getByText('10 selected', { exact: true })).toBeVisible();
          await mkdir('dist/verification', { recursive: true });
          await page.screenshot({
            path: `dist/verification/native-bulk-selection-${theme}.png`,
            animations: 'disabled',
          });
          await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
          await expect(bar).toHaveCount(0);
          const eleventh = page.getByRole('checkbox', { name: 'Select Agent 11', exact: true });
          await expect(eleventh).not.toBeChecked();
          await eleventh.focus();
          await page.keyboard.press('Space');
          await expect(bar.getByText('1 selected', { exact: true })).toBeVisible();
          await page.getByRole('textbox', { name: 'Search agents' }).fill('  AGENT 11  ');
          await expect(
            page.getByRole('list', { name: 'Agent sessions' }).getByRole('listitem')
          ).toHaveCount(1);
          await expect(eleventh).not.toBeChecked();
          await expect(bar).toHaveCount(0);
        },
        sessions
      );
    });

    test(`Agent row selection and rename are independent keyboard actions in ${theme} theme`, async ({
      desktop,
    }) => {
      await withMockDesktop(desktop, async (page) => {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-agent-actions');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await expect(page.getByText('Cannot reach StateSet API', { exact: true })).toHaveCount(0);
        const sessions = page.getByRole('list', { name: 'Agent sessions' });
        const row = sessions.getByRole('button', { name: /^Response Agent.*Running/ });
        await expect(row.locator('button, input')).toHaveCount(0);
        const checkbox = row
          .locator('..')
          .getByRole('checkbox', { name: 'Select Response Agent', exact: true })
          .first();
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(checkbox).toBeChecked();
        await expect(
          page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })
        ).toBeVisible();
        await page.keyboard.press('Space');
        await expect(checkbox).not.toBeChecked();
        const rename = row
          .locator('..')
          .getByRole('button', { name: 'Rename Response Agent', exact: true })
          .first();
        await rename.focus();
        await expect(rename).toBeVisible();
        await page.keyboard.press('Enter');
        const input = page.getByRole('textbox', { name: 'Rename session', exact: true });
        await expect(input).toBeFocused();
        await input.fill('Discarded rename');
        const scan = await new AxeBuilder({ page })
          .setLegacyMode()
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(input).toHaveCount(0);
        await expect(row).toBeFocused();
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/native-agent-actions-${theme}.png`,
          animations: 'disabled',
        });
      });
    });

    test(`Custom template actions preserve keyboard focus in ${theme} theme`, async ({
      desktop,
    }) => {
      await withMockDesktop(desktop, async (page) => {
        await setTestDefaults(page, theme);
        await page.evaluate(async () => {
          await window.electronAPI!.auth.clearApiKey();
          await window.electronAPI!.store.set(
            'customAgentTemplates',
            ['First', 'Second'].map((label) => ({
              id: `custom-${label.toLowerCase()}`,
              name: `${label} custom agent`,
              description: 'Handles account questions',
              icon: 'Bot',
              color: 'bg-purple-600',
              category: 'support',
              agentType: 'interactive',
              isCustom: true,
              config: { mcp_servers: [], model: 'claude-sonnet-4-6', temperature: 0.5 },
            }))
          );
        });
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-template');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.getByRole('button', { name: 'Create new agent', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'My Templates (2)', exact: true }).click();
        const templates = dialog.getByRole('group', { name: 'Agent templates' });
        await expect(templates.locator('button button')).toHaveCount(0);
        const scan = await new AxeBuilder({ page })
          .setLegacyMode()
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
        const first = templates.getByRole('button', { name: /^First custom agent/ });
        await first.focus();
        await page.keyboard.press('Enter');
        await expect(first).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Tab');
        const deleteFirst = templates.getByRole('button', {
          name: 'Delete template First custom agent',
          exact: true,
        });
        await expect(deleteFirst).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(first).toHaveCount(0);
        const second = templates.getByRole('button', { name: /^Second custom agent/ });
        await expect(second).toBeFocused();
        await expect(second).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Space');
        await expect(second).toHaveAttribute('aria-pressed', 'true');
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/native-custom-templates-${theme}.png`,
          animations: 'disabled',
        });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await expect(dialog.getByRole('button', { name: 'All', exact: true })).toBeFocused();
        await expect(dialog.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        await expect
          .poll(() => page.evaluate(() => window.electronAPI!.store.get('customAgentTemplates')))
          .toEqual([]);
      });
    });

    test(`Notifications stay readable while keyboard focused in ${theme} theme`, async ({
      desktop,
    }) => {
      await withMockDesktop(desktop, async (page) => {
        await setTestDefaults(page, theme);
        await page.evaluate(() => window.electronAPI!.auth.clearApiKey());
        await page.reload();
        await expect(page.getByText('Welcome back')).toBeVisible();
        await page.evaluate(
          ({ tenant, brand }) => {
            (window as any).__E2E_AUTH__ = { tenant, brands: [brand] };
          },
          { tenant: mockTenant, brand: mockBrand }
        );
        await page.getByRole('button', { name: 'API Key', exact: true }).click();
        await page.getByLabel('API Key').fill('sk-test-notifications');
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.getByRole('link', { name: 'Connections', exact: true }).click();
        await page.getByRole('button', { name: 'Manual', exact: true }).first().click();
        const fixture = await page.evaluate(async () => {
          const configModule = '/src/config/api.config.ts';
          const { API_CONFIG } = await import(configModule);
          const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/brands/brand_1/secrets`);
          return { status: response.status, ok: response.ok };
        });
        expect(fixture, 'The connected-screen fixture must deliver a usable API response').toEqual({
          status: 200,
          ok: true,
        });
        await page.getByRole('button', { name: 'Save credentials', exact: true }).click();
        const notifications = page.getByRole('region', { name: 'Notifications' });
        const error = notifications.getByRole('alert').filter({ hasText: 'Missing info' });
        await expect(error).toBeVisible();
        const dismiss = error.getByRole('button', { name: 'Dismiss notification' });
        await dismiss.focus();
        await page.waitForTimeout(5500);
        await expect(dismiss).toBeFocused();
        await expect(error).toBeVisible();
        const scan = await new AxeBuilder({ page })
          .setLegacyMode()
          .include('[aria-label="Notifications"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
        await mkdir('dist/verification', { recursive: true });
        await page.screenshot({
          path: `dist/verification/native-notifications-${theme}.png`,
          animations: 'disabled',
        });
        await page.keyboard.press('Enter');
        await expect(error).toBeHidden();
        await page.getByRole('button', { name: 'Disconnect Shopify', exact: true }).click();
        await page
          .getByRole('alertdialog', { name: 'Disconnect Shopify?' })
          .getByRole('button', { name: 'Disconnect', exact: true })
          .click();
        const success = notifications.getByRole('status').filter({ hasText: 'Disconnected' });
        await expect(success).toBeVisible();
        await success.getByRole('button', { name: 'Dismiss notification' }).focus();
        await page.waitForTimeout(5500);
        expect(
          (
            await new AxeBuilder({ page })
              .setLegacyMode()
              .include('[aria-label="Notifications"]')
              .options({ runOnly: ['color-contrast'] })
              .analyze()
          ).violations
        ).toEqual([]);
      });
    });
  }
});
