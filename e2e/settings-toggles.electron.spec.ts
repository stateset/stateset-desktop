import { mkdir } from 'node:fs/promises';
import type { ElectronApplication, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  test,
  expect,
  requireDesktopDisplay,
  type DesktopHarness,
  type DesktopProfile,
} from './desktop';
import { installDesktopApiFixture } from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

const groups = [
  {
    tab: 'Background',
    fields: [
      {
        name: 'Minimize to System Tray',
        key: 'minimizeToTray',
        description: 'Keep agents running when you close the window',
      },
      {
        name: 'Auto-start Agents on Launch',
        key: 'autoStartAgentsOnLaunch',
        description: 'Restart agents that were running when you last closed the app',
      },
    ],
  },
  {
    tab: 'Appearance',
    fields: [
      { name: 'Compact Mode', key: 'compactMode', description: 'Reduce spacing and overall scale' },
      {
        name: 'Reduce Motion',
        key: 'reduceMotion',
        description: 'Limit animations and transitions',
      },
    ],
  },
  {
    tab: 'Notifications',
    fields: [
      {
        name: 'Desktop Notifications',
        key: 'desktopNotifications',
        description: 'Get notified when agents need attention',
      },
      { name: 'Sound Alerts', key: 'soundAlerts', description: 'Play sounds for important events' },
      {
        name: 'Share anonymous usage data',
        key: 'telemetryEnabled',
        description: 'Help improve StateSet by sending anonymized telemetry. Opt-in only.',
      },
    ],
  },
] as const;
const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Settings review',
  slug: 'settings-review',
  tier: 'pro',
};
const brand = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: tenant.id,
  name: 'Owned settings',
  slug: 'owned-settings',
  enabled: true,
};

test.beforeAll(() => requireDesktopDisplay());

async function openSettings(desktop: DesktopHarness, profile: DesktopProfile, seed = false) {
  const application = await desktop.launch(profile);
  try {
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.evaluate(
      async ({ seed, keys }) => {
        await window.electronAPI!.store.set('onboardingCompleted', true);
        if (seed) for (const key of keys) await window.electronAPI!.store.set(key, false);
      },
      { seed, keys: groups.flatMap((group) => group.fields.map((field) => field.key)) }
    );
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
    await page.reload();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    return { application, page };
  } catch (error) {
    await application.close();
    throw error;
  }
}

async function measure(input: Locator) {
  return input.evaluate(async (element) => {
    const track = element.nextElementSibling as HTMLElement;
    await Promise.all(
      track.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))
    );
    const style = getComputedStyle(track);
    const thumb = getComputedStyle(track, '::after');
    const rgba = (value: string) => {
      const match = /^rgba?\(([\d.,\s]+)\)$/.exec(value);
      if (!match) throw new Error('Unsupported computed control color.');
      const channels = match[1].split(',').map(Number);
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const layers: number[][] = [];
    for (let parent = track.parentElement; parent; parent = parent.parentElement) {
      const background = getComputedStyle(parent);
      if (background.backgroundImage !== 'none')
        throw new Error('Control contrast requires a solid surrounding surface.');
      const layer = rgba(background.backgroundColor);
      layers.push(layer);
      if (layer[3] === 1) break;
    }
    let surface = [255, 255, 255];
    for (const layer of layers.reverse())
      surface = surface.map((channel, index) => layer[index] * layer[3] + channel * (1 - layer[3]));
    const luminance = (color: number[]) => {
      const channels = color.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const ratio = (a: number[], b: number[]) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const bounds = element.getBoundingClientRect();
    const trackBounds = track.getBoundingClientRect();
    return {
      checked: (element as HTMLInputElement).checked,
      track: style.backgroundColor,
      thumb: thumb.backgroundColor,
      transform: thumb.transform,
      thumbContrast: ratio(rgba(thumb.backgroundColor), rgba(style.backgroundColor)),
      boundaryContrast: ratio(rgba(style.borderTopColor), surface),
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      focusContrast: ratio(rgba(style.outlineColor), surface),
      targetWidth: bounds.width,
      targetHeight: bounds.height,
      trackWidth: trackBounds.width,
      trackHeight: trackBounds.height,
      fits: bounds.left >= 0 && bounds.right <= innerWidth + 1,
    };
  });
}

for (const size of ['standard', 'minimum'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`settings toggles keep clear states and keyboard focus in ${size} ${theme} layout`, async ({
      desktop,
    }) => {
      const { application, page } = await openSettings(
        desktop,
        await desktop.createProfile({ memoryOnlyCredentials: true })
      );
      const layouts: Record<string, unknown> = {};
      try {
        await mkdir('dist/verification', { recursive: true });
        await application.evaluate(({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (size === 'standard') window.setContentSize(1400, 900);
          else {
            const [width, height] = window.getMinimumSize();
            window.setSize(width, height);
          }
        }, size);
        if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme)
          await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
          .toBe(theme);
        const tabs = [];
        for (const group of groups) {
          await page
            .getByRole('navigation', { name: 'Settings sections', exact: true })
            .getByRole('button', { name: group.tab, exact: true })
            .click();
          const controls = [];
          for (const field of group.fields) {
            const input = page.getByRole('checkbox', { name: field.name, exact: true });
            await expect(input).toHaveAccessibleDescription(field.description);
            if (await input.isChecked()) {
              await input.focus();
              await input.press('Space');
            }
            await expect(input).not.toBeChecked();
            await expect(input).toHaveAttribute('aria-busy', 'false');
            // Clicking the visible caption must activate the same native checkbox.
            await page.getByText(field.name, { exact: true }).click();
            await expect(input).toBeChecked();
            await expect(input).toHaveAttribute('aria-busy', 'false');
            // Space turns the checkbox off and back on, with a visible keyboard ring.
            await input.focus();
            await input.press('Space');
            await expect(input).not.toBeChecked();
            await expect(input).toHaveAttribute('aria-busy', 'false');
            await input.press('Space');
            await expect(input).toBeChecked();
            await expect(input).toHaveAttribute('aria-busy', 'false');
            const on = await measure(input);
            await input.press('Space');
            await expect(input).not.toBeChecked();
            await expect(input).toHaveAttribute('aria-busy', 'false');
            const off = await measure(input);
            expect(on.track).not.toBe(off.track);
            expect(on.transform).not.toBe(off.transform);
            for (const state of [on, off]) {
              expect(state.thumbContrast).toBeGreaterThanOrEqual(3);
              expect(state.boundaryContrast).toBeGreaterThanOrEqual(3);
              expect(state.focusVisible).toBe(true);
              expect(state.outlineStyle).toBe('solid');
              expect(state.outlineWidth).toBeGreaterThanOrEqual(2);
              expect(state.outlineOffset).toBeGreaterThanOrEqual(2);
              expect(state.focusContrast).toBeGreaterThanOrEqual(3);
              expect(state.targetWidth).toBeGreaterThanOrEqual(44);
              expect(state.targetHeight).toBeGreaterThanOrEqual(44);
              expect(state.trackWidth).toBe(44);
              expect(state.trackHeight).toBe(24);
              expect(state.fits).toBe(true);
            }
            controls.push({ name: field.name, description: field.description, on, off });
          }
          await page.mouse.move(0, 0);
          const contrast = await new AxeBuilder({ page })
            .setLegacyMode()
            .include('section:has(.settings-toggle-input)')
            .withRules(['color-contrast'])
            .analyze();
          expect(contrast.violations).toEqual([]);
          expect(contrast.incomplete).toEqual([]);
          const screenshot = `settings-toggles-${size}-${theme}-${group.tab.toLowerCase()}.png`;
          await page.screenshot({
            path: `dist/verification/${screenshot}`,
            animations: 'disabled',
          });
          tabs.push({
            tab: group.tab,
            controls,
            screenshot,
            contrast: { violations: 0, incomplete: 0 },
          });
        }
        layouts[`${size}-${theme}`] = {
          tabs,
          documentFits: await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
        };
        expect((layouts[`${size}-${theme}`] as { documentFits: boolean }).documentFits).toBe(true);
        await test.info().attach('settings-toggle-design', {
          body: Buffer.from(
            JSON.stringify({
              layouts,
              qualification:
                'Seven native checkboxes in this independently tested layout; measured control contrast, focus, target geometry and scoped text contrast. Not a whole-app accessibility audit or live service acceptance.',
            })
          ),
          contentType: 'application/json',
        });
      } finally {
        await application.close();
      }
    });
  }
}

test('settings toggle preferences survive native restart', async ({ desktop }) => {
  const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
  let application: ElectronApplication | undefined;
  const keys = groups.flatMap((group) => group.fields.map((field) => field.key));
  try {
    let current = await openSettings(desktop, profile, true);
    application = current.application;
    for (const group of groups) {
      await current.page
        .getByRole('navigation', { name: 'Settings sections', exact: true })
        .getByRole('button', { name: group.tab, exact: true })
        .click();
      for (const field of group.fields) {
        const input = current.page.getByRole('checkbox', { name: field.name, exact: true });
        await expect(input).not.toBeChecked();
        await expect(input).toHaveAttribute('aria-busy', 'false');
        await input.focus();
        await input.press('Space');
        await expect(input).toBeChecked();
        await expect(input).toHaveAttribute('aria-busy', 'false');
        await expect
          .poll(() => current.page.evaluate((key) => window.electronAPI!.store.get(key), field.key))
          .toBe(true);
      }
    }
    await application.close();
    application = undefined;
    current = await openSettings(desktop, profile);
    application = current.application;
    for (const group of groups) {
      await current.page
        .getByRole('navigation', { name: 'Settings sections', exact: true })
        .getByRole('button', { name: group.tab, exact: true })
        .click();
      for (const field of group.fields)
        await expect(
          current.page.getByRole('checkbox', { name: field.name, exact: true })
        ).toBeChecked();
    }
    await test.info().attach('settings-toggle-persistence', {
      body: Buffer.from(
        JSON.stringify({ keys, acknowledged: 7, restored: 7, transport: 'native-profile' })
      ),
      contentType: 'application/json',
    });
  } finally {
    await application?.close();
  }
});
