import { chmod, mkdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { test, expect, requireDesktopDisplay } from './desktop';
import { installDesktopApiFixture } from './api-fixture';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

test.beforeAll(() => requireDesktopDisplay());
for (const theme of ['dark', 'light'] as const) {
  test(`native preference write failures retain retry state and keep sharing off locally in ${theme} theme`, async ({
    desktop,
  }) => {
    test.skip(process.platform !== 'linux', 'Owned POSIX permission regression');
    const profile = await desktop.createProfile({ memoryOnlyCredentials: true });
    const application = await desktop.launch(profile);
    let restoreModes: { directory: number; file: number } | undefined;
    const tenant = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Preference recovery',
      slug: 'preference-recovery',
      tier: 'pro',
    };
    const brand = {
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenant.id,
      name: 'Owned recovery',
      slug: 'owned-recovery',
      enabled: true,
    };
    try {
      const page = await application.firstWindow();
      let pageErrors = 0;
      page.on('pageerror', () => {
        pageErrors++;
      });
      await page.waitForURL(`${DESKTOP_TEST_ORIGIN}/**`);
      await page.evaluate(async (theme) => {
        await window.electronAPI!.store.set('theme', theme);
        await window.electronAPI!.store.set('onboardingCompleted', true);
        await window.electronAPI!.store.set('soundAlerts', true);
        await window.electronAPI!.store.set('telemetryEnabled', true);
      }, theme);
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
      const navigation = page.getByRole('navigation', { name: 'Settings sections', exact: true });
      await navigation.getByRole('button', { name: 'Notifications', exact: true }).click();
      const sound = page.getByRole('checkbox', { name: 'Sound Alerts', exact: true });
      const sharing = page.getByRole('checkbox', {
        name: 'Share anonymous usage data',
        exact: true,
      });
      const collected = () =>
        page.evaluate(async () => {
          const module = '/src/lib/telemetry.ts';
          const telemetry = await import(module);
          return telemetry.getTelemetry()?.isEnabled() ?? false;
        });
      await expect(sound).toBeChecked();
      await expect(sharing).toBeChecked();
      await expect.poll(collected).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(
            async () => typeof (await window.electronAPI!.store.get('telemetryUserId')) === 'string'
          )
        )
        .toBe(true);
      const owner = await application.evaluate(({ app }) => ({
        directory: app.getPath('userData'),
        uid: process.getuid?.(),
      }));
      expect(path.resolve(owner.directory)).toBe(path.resolve(profile.userData));
      expect(owner.uid).toBeDefined();
      expect(owner.uid).not.toBe(0);
      const file = path.join(profile.userData, 'stateset-config.json');
      const lock = {
        modes: {
          directory: (await stat(profile.userData)).mode & 0o777,
          file: (await stat(file)).mode & 0o777,
        },
        hash: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      };
      restoreModes = lock.modes;
      await chmod(path.join(profile.userData, 'stateset-config.json'), 0o400);
      await chmod(profile.userData, 0o500);
      await sound.click();
      await expect(
        page.getByText('This change could not be saved. Try again.', { exact: true })
      ).toBeVisible();
      await expect(sound).toBeChecked();
      await expect(sound).toHaveAttribute('aria-busy', 'false');
      await sharing.click();
      await expect(
        page.getByText(
          'Sharing is off for this session. Your restart preference could not be saved.',
          { exact: true }
        )
      ).toBeVisible();
      await expect(sharing).not.toBeChecked();
      await expect.poll(collected).toBe(false);
      expect(await page.evaluate(() => window.electronAPI!.store.get('telemetryEnabled'))).toBe(
        true
      );
      await navigation.getByRole('button', { name: 'Appearance', exact: true }).click();
      await navigation.getByRole('button', { name: 'Notifications', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Retry saving Sound Alerts', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Retry saving Share anonymous usage data', exact: true })
      ).toBeVisible();
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({
        path: `dist/verification/settings-save-failure-${theme}.png`,
        animations: 'disabled',
      });
      const unchanged =
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex') === lock.hash;
      expect(unchanged).toBe(true);
      await chmod(profile.userData, restoreModes.directory);
      await chmod(path.join(profile.userData, 'stateset-config.json'), restoreModes.file);
      restoreModes = undefined;
      await page.getByRole('button', { name: 'Retry saving Sound Alerts', exact: true }).click();
      await expect(sound).not.toBeChecked();
      await expect(sound).toHaveAttribute('aria-busy', 'false');
      await expect
        .poll(() => page.evaluate(() => window.electronAPI!.store.get('soundAlerts')))
        .toBe(false);
      await page
        .getByRole('button', { name: 'Retry saving Share anonymous usage data', exact: true })
        .click();
      await expect(sharing).not.toBeChecked();
      await expect(sharing).toHaveAttribute('aria-busy', 'false');
      await expect
        .poll(() => page.evaluate(() => window.electronAPI!.store.get('telemetryEnabled')))
        .toBe(false);
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(await collected()).toBe(false);
      expect(pageErrors).toBe(0);
      await mkdir('dist/verification', { recursive: true });
      await page.screenshot({
        path: `dist/verification/settings-save-recovery-${theme}.png`,
        animations: 'disabled',
      });
      const info = test.info();
      await info.attach('settings-save-recovery', {
        body: Buffer.from(
          JSON.stringify({
            theme,
            failure: 'owned-profile-file-and-directory-read-only',
            originalConfigUnchanged: unchanged,
            genericValueRestored: true,
            sharingStoppedLocally: true,
            sharingPreferenceInitiallyRetained: true,
            retrySurvivedNavigation: true,
            realHandlerRetriesAcknowledged: true,
            savedValues: { soundAlerts: false, telemetryEnabled: false },
            pageErrors,
            qualification:
              'Actual owned Linux profile permissions and native IPC; restored before cleanup. No host profile, network telemetry endpoint, live workflow or OS keyring acceptance.',
          })
        ),
        contentType: 'application/json',
      });
    } finally {
      try {
        if (restoreModes) {
          await chmod(profile.userData, restoreModes.directory);
          await chmod(path.join(profile.userData, 'stateset-config.json'), restoreModes.file);
        }
      } finally {
        await application.close();
      }
    }
  });
}
