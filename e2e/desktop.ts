import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test as base, expect, chromium, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';
import { DESKTOP_TEST_ORIGIN } from './dev-server';

export interface DesktopProfile {
  entry: string;
  userData: string;
  packaged: boolean;
}

export interface BundleProfile {
  configHome: string;
  cacheHome: string;
  dataHome: string;
}

/** Every launch uses an owned temporary profile, including failed test setup. */
export class DesktopHarness {
  private directories: string[] = [];
  private applications = new Set<ElectronApplication>();
  private bundles = new Set<{ page?: Page; close: () => Promise<void> }>();

  checkpoint() {
    return {
      applications: new Set(this.applications),
      bundles: new Set(this.bundles),
      directories: new Set(this.directories),
    };
  }

  async createBundleProfile(): Promise<BundleProfile> {
    const directory = await mkdtemp(path.join(tmpdir(), 'stateset-bundle-e2e-'));
    this.directories.push(directory);
    const profile = {
      configHome: path.join(directory, 'config'),
      cacheHome: path.join(directory, 'cache'),
      dataHome: path.join(directory, 'data'),
    };
    await Promise.all(Object.values(profile).map((folder) => mkdir(folder, { mode: 0o700 })));
    return profile;
  }

  async launchBundle(
    executable: string,
    profile: BundleProfile,
    options: { appImagePath?: string; extraCACertPath?: string } = {}
  ) {
    if (process.platform !== 'linux') throw new Error('This bundle smoke test requires Linux.');
    const child = spawn(
      path.resolve(executable),
      ['--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          ...(options.extraCACertPath
            ? { NODE_EXTRA_CA_CERTS: path.resolve(options.extraCACertPath) }
            : {}),
          // An AppImage terminal can leak its own mount into child processes.
          // Extracted AppRun must resolve the application we are testing.
          APPDIR: options.appImagePath ? path.dirname(path.resolve(executable)) : '',
          APPIMAGE: options.appImagePath ? path.resolve(options.appImagePath) : '',
          NODE_ENV: 'production',
          E2E_TEST: 'false',
          PLAYWRIGHT_TEST: 'false',
          STORE_ENCRYPTION_KEY: '',
          DISABLE_AUTO_UPDATER: 'true',
          OPEN_DEVTOOLS: 'false',
          XDG_CONFIG_HOME: profile.configHome,
          XDG_CACHE_HOME: profile.cacheHome,
          XDG_DATA_HOME: profile.dataHome,
        },
      }
    );
    // Keep bounded startup diagnostics after CDP opens too: a main-process
    // dependency failure can expose CDP without ever creating the renderer.
    let startupStderr = '';
    child.stderr.on('data', (bytes: Buffer) => {
      startupStderr = (startupStderr + bytes.toString()).slice(-20_000);
    });
    let exited = false;
    const exit = new Promise<void>((resolve) => {
      const done = () => {
        exited = true;
        resolve();
      };
      child.once('exit', done);
      child.once('error', done);
    });
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
    const bundle: { page?: Page; close: () => Promise<void> } = {
      close: async () => {
        if (!exited && bundle.page && !bundle.page.isClosed()) {
          await bundle.page
            .evaluate(() => window.electronAPI!.background.setMinimizeToTray(false))
            .catch(() => undefined);
          // CDP Target.closeTarget can destroy webContents without closing its
          // native Electron window. Exercise the normal window close instead.
          await bundle.page
            .evaluate(() => window.electronAPI!.window.close())
            .catch(() => undefined);
        }
        if (!exited) {
          let timer: ReturnType<typeof setTimeout>;
          await Promise.race([
            exit,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 5000);
            }),
          ]).finally(() => clearTimeout(timer!));
          if (!exited) {
            child.kill('SIGKILL');
            await exit;
          }
        }
        await browser?.close().catch(() => undefined);
        this.bundles.delete(bundle);
      },
    };
    this.bundles.add(bundle);
    try {
      // Attach to the production renderer without injecting a main-process loader.
      const endpoint = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(
          () => onError(new Error(`Bundle did not expose its browser endpoint: ${output}`)),
          30_000
        );
        const cleanup = () => {
          clearTimeout(timer);
          child.stderr.off('data', onData);
          child.off('error', onError);
          child.off('exit', onExit);
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onExit = () => onError(new Error(`Bundle exited before opening: ${output}`));
        const onData = (bytes: Buffer) => {
          output = (output + bytes.toString()).slice(-20_000);
          const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) {
            cleanup();
            resolve(match[1]);
          }
        };
        child.stderr.on('data', onData);
        child.once('error', onError);
        child.once('exit', onExit);
      });
      // Drain stderr after discovering the endpoint, so a full pipe cannot block the app.
      child.stderr.resume();
      // Electron exposes an initial ':' frame before loadFile commits. Attaching
      // there can leave Playwright waiting forever for a missed navigation event.
      const targetsURL = new URL(endpoint);
      targetsURL.protocol = 'http:';
      targetsURL.pathname = '/json/list';
      await expect
        .poll(
          async () => {
            const targets: Array<{ type: string; title: string; url: string }> = await fetch(
              targetsURL
            ).then((response) => response.json());
            return targets.some(
              (target) =>
                target.type === 'page' &&
                target.url.startsWith('file://') &&
                target.title.includes('StateSet')
            );
          },
          { timeout: 30_000 }
        )
        .toBe(true);
      browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
      const context = browser.contexts()[0];
      bundle.page = context.pages()[0] ?? (await context.waitForEvent('page'));
      return {
        page: bundle.page,
        close: async () => {
          await bundle.close();
          expect(child.exitCode, 'The bundle must quit cleanly before restart').toBe(0);
        },
      };
    } catch (error) {
      await bundle.close();
      throw Object.assign(
        new Error(
          `${error instanceof Error ? error.message : String(error)}\nBundle startup stderr:\n${startupStderr}`
        ),
        { cause: error }
      );
    }
  }

  async createProfile({
    packaged = false,
    memoryOnlyCredentials = false,
  } = {}): Promise<DesktopProfile> {
    const directory = await mkdtemp(path.join(tmpdir(), 'stateset-desktop-e2e-'));
    this.directories.push(directory);
    const userData = path.join(directory, 'user-data');
    const entry = path.join(directory, 'bootstrap.cjs');
    const metadata = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: metadata.name,
        version: metadata.version,
        main: 'bootstrap.cjs',
      }),
      { mode: 0o600 }
    );
    await mkdir(userData, { mode: 0o700 });
    // Set the path before main.ts initializes electron-store or its encryption key.
    await writeFile(
      entry,
      `const { app } = require('electron');\n` +
        `app.setPath('userData', ${JSON.stringify(userData)});\n` +
        `app.setPath('sessionData', ${JSON.stringify(userData)});\n` +
        // This owned profile can exercise the app's real memory-only fallback
        // without consulting or changing the host's interactive OS keyring.
        (memoryOnlyCredentials
          ? `require('electron').safeStorage.isEncryptionAvailable = () => false;\n`
          : '') +
        (packaged ? `Object.defineProperty(app, 'isPackaged', { get: () => true });\n` : '') +
        `require(${JSON.stringify(path.resolve('dist/electron/main.js'))});\n`,
      { mode: 0o600 }
    );
    return { entry: directory, userData, packaged };
  }

  async launch(
    profile: DesktopProfile | Promise<DesktopProfile> = this.createProfile(),
    options: { extraCACertPath?: string } = {}
  ): Promise<ElectronApplication> {
    const isolated = await profile;
    const args = [isolated.entry];
    if (process.platform === 'linux') {
      args.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
    }
    const application = await electron.launch({
      args,
      env: {
        ...process.env,
        ...(options.extraCACertPath
          ? { NODE_EXTRA_CA_CERTS: path.resolve(options.extraCACertPath) }
          : {}),
        NODE_ENV: isolated.packaged ? 'production' : 'development',
        STORE_ENCRYPTION_KEY: '',
        E2E_TEST: 'true',
        VITE_DEV_SERVER_URL: DESKTOP_TEST_ORIGIN,
        DISABLE_AUTO_UPDATER: 'true',
        OPEN_DEVTOOLS: 'false',
      },
    });
    this.applications.add(application);
    application.on('close', () => this.applications.delete(application));
    expect(
      await application.evaluate(({ app }) => ({
        userData: app.getPath('userData'),
        sessionData: app.getPath('sessionData'),
      }))
    ).toEqual({ userData: isolated.userData, sessionData: isolated.userData });
    return application;
  }

  async captureFailure(info: TestInfo) {
    let index = 0;
    for (const bundle of this.bundles) {
      if (bundle.page) {
        const name = `bundle-failure-${index++}`;
        await bundle.page
          .screenshot({
            path: info.outputPath(`${name}.png`),
            animations: 'disabled',
            timeout: 5000,
          })
          .then(() =>
            info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' })
          )
          .catch(() => undefined);
      }
    }
    for (const application of this.applications) {
      for (const page of application.windows()) {
        // These are custom Electron pages, so Playwright's default page fixture
        // does not capture their failure screenshots automatically.
        const name = `desktop-failure-${index++}`;
        await page
          .screenshot({
            path: info.outputPath(`${name}.png`),
            animations: 'disabled',
            timeout: 5000,
          })
          .then(() =>
            info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' })
          )
          .catch(() => undefined);
      }
    }
  }

  async disposeAfter(checkpoint: ReturnType<DesktopHarness['checkpoint']>) {
    // Close processes before deleting their profiles; a setup failure still gets cleaned up.
    const bundles = [...this.bundles].filter((bundle) => !checkpoint.bundles.has(bundle));
    const applications = [...this.applications].filter(
      (application) => !checkpoint.applications.has(application)
    );
    const directories = this.directories.filter(
      (directory) => !checkpoint.directories.has(directory)
    );
    await Promise.all(bundles.map((bundle) => bundle.close()));
    await Promise.all(applications.map((application) => application.close()));
    for (const application of applications) this.applications.delete(application);
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true })));
    this.directories = this.directories.filter((directory) =>
      checkpoint.directories.has(directory)
    );
  }

  async dispose() {
    await this.disposeAfter({
      applications: new Set(),
      bundles: new Set(),
      directories: new Set(),
    });
  }
}

export function requireDesktopDisplay() {
  const missing =
    process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  if (missing && process.env.CI)
    throw new Error('Electron tests require a display. Run with xvfb-run.');
  base.skip(missing, 'Electron tests require a display (set DISPLAY or use Xvfb).');
  // A configured display or an Electron launch failure must fail, rather than silently skip.
}

export const test = base.extend<{ desktopTestCleanup: void }, { desktop: DesktopHarness }>({
  desktop: [
    // Playwright requires object destructuring for fixture dependency discovery.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const desktop = new DesktopHarness();
      try {
        await use(desktop);
      } finally {
        await desktop.dispose();
      }
    },
    { scope: 'worker' },
  ],
  desktopTestCleanup: [
    async ({ desktop }, use, info) => {
      // BeforeAll windows belong to the suite. Every test owns only the new
      // processes/profiles created after this checkpoint, including failed setup.
      const checkpoint = desktop.checkpoint();
      try {
        await use();
      } finally {
        try {
          if (info.status !== info.expectedStatus && info.status !== 'skipped')
            await desktop.captureFailure(info);
        } finally {
          await desktop.disposeAfter(checkpoint);
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
