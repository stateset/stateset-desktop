import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listPackage } from '@electron/asar';
import { test, expect, requireDesktopDisplay } from './desktop';
import metadata from '../package.json';

test.beforeAll(() => requireDesktopDisplay());

test('Linux bundle opens its production renderer and retains encrypted settings after restart', async ({
  desktop,
}) => {
  test.skip(process.platform !== 'linux', 'Linux bundle verification');
  const executable = process.env.STATESET_PACKAGED_EXECUTABLE;
  if (!executable)
    throw new Error('Set STATESET_PACKAGED_EXECUTABLE to the built Linux application.');
  const profile = await desktop.createBundleProfile();
  let application = await desktop.launchBundle(executable, profile);
  let page = application.page;
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.app.isE2ETest)).toBe(false);
  expect(await page.evaluate(() => window.electronAPI!.app.getVersion())).toBe(metadata.version);
  await page.evaluate(() => window.electronAPI!.store.set('theme', 'light'));
  const directories = await readdir(profile.configHome);
  const profiles = [];
  for (const directory of directories) {
    const location = path.join(profile.configHome, directory);
    if (
      await stat(path.join(location, '.store-key'))
        .then(() => true)
        .catch(() => false)
    )
      profiles.push(location);
  }
  expect(profiles).toHaveLength(1);
  const userData = profiles[0];
  const keyPath = path.join(userData, '.store-key');
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const originalKey = digest(await readFile(keyPath));
  expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  expect(
    (await readFile(path.join(userData, 'stateset-config.json'))).includes(Buffer.from('"theme"'))
  ).toBe(false);
  const archive = path.join(path.dirname(path.resolve(executable)), 'resources', 'app.asar');
  const files = listPackage(archive, { isPack: false });
  expect(files.some((file) => file.endsWith('/dist/electron/main.js'))).toBe(true);
  expect(files.some((file) => file.endsWith('/dist/renderer/index.html'))).toBe(true);
  expect(
    files.filter(
      (file) => file.includes('/dist/verification/') || /\/dist\/electron\/.*\.test\.js$/.test(file)
    )
  ).toEqual([]);
  await application.close();

  application = await desktop.launchBundle(executable, profile);
  page = application.page;
  await page.waitForURL(/^file:\/\//);
  await expect(page.getByText('Welcome back')).toBeVisible();
  expect(await page.evaluate(() => window.electronAPI!.store.get('theme'))).toBe('light');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('light');
  expect(digest(await readFile(keyPath))).toBe(originalKey);
  await mkdir('dist/verification', { recursive: true });
  await page.screenshot({
    path: 'dist/verification/linux-bundle-startup.png',
    animations: 'disabled',
  });
  await application.close();
});
