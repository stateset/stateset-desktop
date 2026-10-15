import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, requireDesktopDisplay } from './desktop';

test.beforeAll(() => requireDesktopDisplay());

test('packaged startup path opens without an environment key and preserves encrypted preferences', async ({
  desktop,
}) => {
  const profile = await desktop.createProfile({ packaged: true });
  let application = await desktop.launch(profile);
  let page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  expect(await application.evaluate(() => process.env.STORE_ENCRYPTION_KEY)).toBe('');
  await page.evaluate(() => window.electronAPI!.store.set('theme', 'light'));
  const keyPath = path.join(profile.userData, '.store-key');
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  const originalKey = digest(await readFile(keyPath));
  if (process.platform !== 'win32') expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  expect(
    (await readFile(path.join(profile.userData, 'stateset-config.json'))).includes(
      Buffer.from('"theme"')
    )
  ).toBe(false);
  await application.close();

  application = await desktop.launch(profile);
  page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  expect(digest(await readFile(keyPath))).toBe(originalKey);
  await application.close();
});

test('packaged startup path encrypts legacy JSON while retaining its settings', async ({
  desktop,
}) => {
  const profile = await desktop.createProfile({ packaged: true });
  const configuration = path.join(profile.userData, 'stateset-config.json');
  await writeFile(configuration, JSON.stringify({ theme: 'light', onboardingCompleted: true }));
  const application = await desktop.launch(profile);
  const page = await application.firstWindow();
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  expect(await page.evaluate(() => window.electronAPI!.store.get('onboardingCompleted'))).toBe(
    true
  );
  expect((await readFile(configuration)).includes(Buffer.from('onboardingCompleted'))).toBe(false);
  if (process.platform !== 'win32') expect((await stat(configuration)).mode & 0o777).toBe(0o600);
  await application.close();
});
