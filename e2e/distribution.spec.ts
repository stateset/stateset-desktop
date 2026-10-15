import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import metadata from '../package.json';
import { test, expect, requireDesktopDisplay } from './desktop';

const execute = promisify(execFile);
const { load } = createRequire(path.resolve('package.json'))('js-yaml') as {
  load: (source: string) => unknown;
};

function artifactDirectory() {
  const value = process.env.STATESET_LINUX_ARTIFACTS_DIR;
  if (!value) throw new Error('Set STATESET_LINUX_ARTIFACTS_DIR to the Linux build output.');
  return path.resolve(value);
}

async function digest(
  filename: string,
  algorithm: 'sha256' | 'sha512',
  encoding: 'hex' | 'base64'
) {
  const hash = createHash(algorithm);
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest(encoding);
}

async function findInstaller(extension: string) {
  const directory = artifactDirectory();
  const matches = (await readdir(directory)).filter((name) => name.endsWith(extension));
  expect(matches, `Expected one ${extension} installer`).toHaveLength(1);
  expect(matches[0]).toContain(metadata.version);
  return path.join(directory, matches[0]);
}

test.beforeAll(() => requireDesktopDisplay());

test('Linux updater metadata identifies the exact produced installer bytes', async () => {
  const directory = artifactDirectory();
  const fileSchema = z.object({
    url: z.string().min(1),
    sha512: z.string().min(1),
    size: z.number().int().positive(),
  });
  const manifest = z
    .object({
      version: z.literal(metadata.version),
      files: z.array(fileSchema).nonempty(),
      path: z.string().min(1),
      sha512: z.string().min(1),
    })
    .parse(load(await readFile(path.join(directory, 'latest-linux.yml'), 'utf8')));
  for (const file of manifest.files) {
    const name = decodeURIComponent(file.url);
    expect(path.basename(name)).toBe(name);
    const filename = path.join(directory, name);
    expect((await stat(filename)).size).toBe(file.size);
    expect(await digest(filename, 'sha512', 'base64')).toBe(file.sha512);
  }
  const primary = manifest.files.find((file) => file.url === manifest.path);
  expect(primary, 'Legacy updater path must identify a listed installer').toBeDefined();
  expect(primary!.sha512).toBe(manifest.sha512);
});

for (const format of ['AppImage', 'deb'] as const) {
  test(`${format} contains the verified app and opens its production renderer`, async ({
    desktop,
  }) => {
    const profile = await desktop.createBundleProfile();
    // Extraction and app data stay inside the harness's owned temporary directory.
    const extracted = path.join(profile.dataHome, 'extracted');
    await mkdir(extracted);
    const installer = await findInstaller(`.${format}`);
    let appDirectory: string;
    let executable: string;
    if (format === 'AppImage') {
      await execute(installer, ['--appimage-extract'], { cwd: extracted });
      appDirectory = path.join(extracted, 'squashfs-root');
      executable = path.join(appDirectory, 'AppRun');
    } else {
      await execute('dpkg-deb', ['--extract', installer, extracted]);
      appDirectory = path.join(extracted, 'opt', metadata.build.productName);
      executable = path.join(appDirectory, metadata.name);
      await stat(path.join(extracted, 'usr', 'share', 'applications', `${metadata.name}.desktop`));
    }
    expect(await readdir(appDirectory)).toContain('resources');
    const archive = path.join(appDirectory, 'resources', 'app.asar');
    const unpackedArchive = path.join(
      artifactDirectory(),
      'linux-unpacked',
      'resources',
      'app.asar'
    );
    expect(await digest(archive, 'sha256', 'hex')).toBe(
      await digest(unpackedArchive, 'sha256', 'hex')
    );
    expect((await stat(executable)).mode & 0o111).not.toBe(0);
    const application = await desktop.launchBundle(executable, profile, {
      appImagePath: format === 'AppImage' ? installer : undefined,
    });
    const page = application.page;
    await page.waitForURL(/^file:\/\//);
    await expect(page.getByText('Welcome back')).toBeVisible();
    expect(await page.evaluate(() => window.electronAPI!.app.isE2ETest)).toBe(false);
    expect(await page.evaluate(() => window.electronAPI!.app.getVersion())).toBe(metadata.version);
    await mkdir('dist/verification', { recursive: true });
    await page.screenshot({
      path: `dist/verification/linux-${format}-startup.png`,
      animations: 'disabled',
    });
    await application.close();
  });
}
