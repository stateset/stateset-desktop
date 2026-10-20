import { mkdir } from 'node:fs/promises';
import type { ElectronApplication } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, requireDesktopDisplay } from './desktop';
import { installDesktopApiFixture } from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';
import { createWorkflowEngineFixture } from './workflow-engine-fixture';

test.beforeAll(() => requireDesktopDisplay());

test('engine settings stay readable and keyboard accessible in both themes at minimum window width', async ({
  desktop,
}) => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Settings design workspace',
    slug: 'settings-design-workspace',
    tier: 'pro',
  };
  const brand = {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: tenant.id,
    name: 'Settings design brand',
    slug: 'settings-design-brand',
    enabled: true,
  };
  const fixtureKey = 'owned-settings-design-fixture-key';
  const engine = await createWorkflowEngineFixture({ apiKey: fixtureKey, tenantId: tenant.id });
  const layouts: Record<string, unknown> = {};
  let application: ElectronApplication | undefined;
  try {
    application = await desktop.launch(
      await desktop.createProfile({ memoryOnlyCredentials: true })
    );
    const page = await application.firstWindow();
    await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
    await page.evaluate(
      async ({ engineUrl, fixtureKey }) => {
        if (!window.electronAPI?.durableWorkflows)
          throw new Error(
            'Native workflow transport is unavailable. Integrate transport before this case.'
          );
        await window.electronAPI.store.set('durableWorkflowEngineUrl', engineUrl);
        await window.electronAPI.auth.setDurableEngineApiKey(fixtureKey);
        await window.electronAPI.store.set('onboardingCompleted', true);
        await window.electronAPI.store.set('theme', 'dark');
      },
      { engineUrl: engine.url, fixtureKey }
    );
    await installDesktopApiFixture(application, page, { tenant, brand, sessions: [] });
    await page.context().addInitScript(
      ({ tenant, brand }) => {
        window.__E2E_AUTH__ = { tenant, brands: [brand] } as any;
      },
      { tenant, brand }
    );
    await page.reload();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Settings sections', exact: true })
      .getByRole('button', { name: 'Background', exact: true })
      .click();
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Durable Workflow Engine', exact: true }),
    });
    const engineInput = section.getByLabel('Engine URL', { exact: true });
    const keyInput = section.getByLabel('API key', { exact: true });
    const save = section.getByRole('button', { name: 'Save configuration', exact: true });
    const testConnection = section.getByRole('button', { name: 'Test connection', exact: true });
    await expect(engineInput).toHaveValue(engine.url);
    await expect(save).toBeEnabled();
    const inputId = await keyInput.getAttribute('id');
    expect(inputId).toMatch(/^[:_A-Za-z0-9-]+$/);
    const scope = `section:has(input[id="${inputId}"])`;
    const inspectContrast = async () => {
      const report = await new AxeBuilder({ page })
        .setLegacyMode()
        .include(scope)
        .withRules(['color-contrast'])
        .analyze();
      expect(report.violations).toEqual([]);
      expect(report.incomplete).toEqual([]);
      const primaryPassed = report.passes.some(
        (rule) =>
          rule.id === 'color-contrast' &&
          rule.nodes.some(
            (node) => /^<button[\s>]/i.test(node.html) && node.html.includes('Save configuration')
          )
      );
      expect(primaryPassed).toBe(true);
      return {
        rule: 'color-contrast',
        minimumNormalTextRatio: 4.5,
        violations: report.violations.length,
        incomplete: report.incomplete.length,
        primaryPassed,
      };
    };
    const inspectLayout = () =>
      section.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
          sectionFits:
            bounds.left >= 0 &&
            bounds.right <= innerWidth + 1 &&
            element.scrollWidth <= element.clientWidth + 1,
          controls: Array.from(element.querySelectorAll<HTMLElement>('input, button')).map(
            (control) => {
              const rect = control.getBoundingClientRect();
              return {
                tag: control.tagName,
                fits:
                  rect.width > 0 &&
                  rect.height > 0 &&
                  rect.left >= bounds.left &&
                  rect.right <= bounds.right + 1 &&
                  control.scrollWidth <= control.clientWidth + 1,
              };
            }
          ),
        };
      });
    const focusStyle = (control: typeof keyInput) =>
      control.evaluate((element) => {
        const style = getComputedStyle(element);
        const rgba = (color: string) => {
          const match = /^rgba?\(([\d.,\s]+)\)$/.exec(color);
          if (!match) throw new Error(`Unsupported computed focus color: ${color}`);
          const values = match[1].split(',').map(Number);
          return [values[0], values[1], values[2], values[3] ?? 1];
        };
        const layers: number[][] = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const surroundingStyle = getComputedStyle(parent);
          if (surroundingStyle.backgroundImage !== 'none')
            throw new Error('Focus contrast needs a solid surrounding surface.');
          const layer = rgba(surroundingStyle.backgroundColor);
          layers.push(layer);
          if (layer[3] === 1) break;
        }
        let surrounding = [255, 255, 255];
        for (const layer of layers.reverse())
          surrounding = surrounding.map(
            (channel, index) => layer[index] * layer[3] + channel * (1 - layer[3])
          );
        const outline = rgba(style.outlineColor);
        const renderedOutline = surrounding.map(
          (channel, index) => outline[index] * outline[3] + channel * (1 - outline[3])
        );
        const luminance = (color: number[]) => {
          const linear = color.map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const a = luminance(renderedOutline);
        const b = luminance(surrounding);
        return {
          focused: document.activeElement === element,
          focusVisible: element.matches(':focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineOffset: Number.parseFloat(style.outlineOffset),
          outlineColor: style.outlineColor,
          background: style.backgroundColor,
          surroundingBackground: `rgb(${surrounding.join(', ')})`,
          contrastRatio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
    await mkdir('dist/verification', { recursive: true });
    for (const size of ['standard', 'minimum'] as const) {
      await application.evaluate(({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (size === 'standard') window.setContentSize(1400, 900);
        else {
          const [width, height] = window.getMinimumSize();
          window.setSize(width, height);
        }
      }, size);
      for (const theme of ['dark', 'light'] as const) {
        if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme)
          await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
          .toBe(theme);
        await expect(keyInput).toHaveAccessibleName('API key');
        const storageDescription =
          'The key is available for this app session. Enter it again after restarting.';
        await expect(keyInput).toHaveAccessibleDescription(storageDescription);
        const helper = await keyInput.evaluate((element) => {
          const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
          return {
            references: ids.length,
            helperOutsideLabel: ids.every((id) => {
              const helper = document.getElementById(id);
              return helper !== null && helper.closest('label') === null;
            }),
          };
        });
        expect(helper).toEqual({ references: 1, helperOutsideLabel: true });
        await engineInput.focus();
        await page.keyboard.press('Tab');
        await expect(keyInput).toBeFocused();
        const keyFocus = await focusStyle(keyInput);
        await page.keyboard.press('Tab');
        await expect(save).toBeFocused();
        const saveFocus = await focusStyle(save);
        for (const focus of [keyFocus, saveFocus]) {
          expect(focus.focused).toBe(true);
          expect(focus.focusVisible).toBe(true);
          expect(focus.outlineStyle).toBe('solid');
          expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
          // A separated outline contrasts with its surrounding surface, not the fill.
          expect(focus.outlineOffset).toBeGreaterThanOrEqual(2);
          expect(focus.contrastRatio).toBeGreaterThanOrEqual(3);
          expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
        }
        await page.keyboard.press('Enter');
        const success = section.getByRole('status');
        await expect(success).toHaveText('Durable workflow configuration saved.');
        await expect(success).toBeVisible();
        await expect(save).toBeEnabled();
        await section.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const successContrast = await inspectContrast();
        const primary = await save.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.trim(),
            color: style.color,
            textFillColor: style.webkitTextFillColor,
            background: style.backgroundColor,
            opacity: style.opacity,
            visibility: style.visibility,
          };
        });
        expect(primary.text).toBe('Save configuration');
        expect(primary.opacity).toBe('1');
        expect(primary.visibility).toBe('visible');
        await testConnection.click();
        const failure = section.getByRole('alert');
        await expect(failure).toHaveText('No engine operation is allowed in this fixture.');
        await expect(failure).toBeVisible();
        await expect(testConnection).toBeEnabled();
        await section.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const failureContrast = await inspectContrast();
        const layout = await inspectLayout();
        expect(layout.documentFits).toBe(true);
        expect(layout.sectionFits).toBe(true);
        expect(layout.controls).toHaveLength(5);
        expect(layout.controls.every((control) => control.fits)).toBe(true);
        const screenshot = `engine-settings-${size}-${theme}.png`;
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        });
        const textBounds = await save.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const bounds = range.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        });
        const capture = await page.screenshot({
          path: `dist/verification/${screenshot}`,
          animations: 'disabled',
        });
        const primaryPixels = await page.evaluate(
          async ({ png, textBounds }) => {
            const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
            const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            try {
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext('2d');
              if (!context) throw new Error('PNG inspection requires a canvas context.');
              context.drawImage(image, 0, 0);
              const scaleX = image.width / innerWidth;
              const scaleY = image.height / innerHeight;
              const x = Math.floor(textBounds.x * scaleX);
              const y = Math.floor(textBounds.y * scaleY);
              const width = Math.ceil(textBounds.width * scaleX);
              const height = Math.ceil(textBounds.height * scaleY);
              if (x < 0 || y < 0 || x + width > image.width || y + height > image.height)
                throw new Error('The primary label is outside the captured viewport.');
              const pixels = context.getImageData(x, y, width, height).data;
              let foregroundPixels = 0;
              for (let index = 0; index < pixels.length; index += 4)
                if (
                  pixels[index] >= 240 &&
                  pixels[index + 1] >= 240 &&
                  pixels[index + 2] >= 240 &&
                  pixels[index + 3] >= 240
                )
                  foregroundPixels++;
              const sampledPixels = width * height;
              return {
                width,
                height,
                foregroundPixels,
                sampledPixels,
                foregroundFraction: foregroundPixels / sampledPixels,
              };
            } finally {
              image.close();
            }
          },
          { png: capture.toString('base64'), textBounds }
        );
        expect(primaryPixels.foregroundFraction).toBeGreaterThanOrEqual(0.01);
        expect(primaryPixels.foregroundFraction).toBeLessThan(0.8);
        layouts[`${size}-${theme}`] = {
          ...layout,
          helper,
          keyFocus,
          saveFocus,
          primary,
          primaryPixels,
          successContrast,
          failureContrast,
          successVisible: true,
          failureVisible: true,
          screenshot,
        };
      }
    }
    expect(engine.requests).toHaveLength(4);
    expect(
      engine.requests.every(
        (request) =>
          request.method === 'GET' &&
          request.path === '/health' &&
          request.authorizationMatches &&
          request.tenantMatches
      )
    ).toBe(true);
    expect(engine.handlerErrors).toBe(0);
    await test.info().attach('engine-settings-design', {
      body: Buffer.from(
        JSON.stringify({
          layouts,
          transport: 'native',
          requests: engine.requests,
          noWorkflowRequests: true,
          ambientRootProbeCount: engine.ambientRootProbeCount,
          qualification:
            'Scoped color-contrast analysis and measured native settings layouts; this is not a whole-application accessibility audit.',
        })
      ),
      contentType: 'application/json',
    });
  } finally {
    try {
      await application?.close();
    } finally {
      await engine.close();
    }
  }
});
