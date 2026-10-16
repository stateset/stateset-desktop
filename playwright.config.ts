import { defineConfig } from '@playwright/test';
import { desktopEvidence } from './e2e/reporting';
import { DESKTOP_TEST_ORIGIN, DESKTOP_TEST_PORT } from './e2e/dev-server';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Visual regression test settings
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  // Snapshot directory for visual regression tests
  snapshotDir: 'e2e/__screenshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  retries: isCI ? 2 : 0,
  workers: 1,
  // Run tests in order for visual consistency
  fullyParallel: false,
  use: {
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    video: isCI ? 'retain-on-failure' : 'off',
    screenshot: isCI ? 'only-on-failure' : 'off',
    // Disable animations for visual tests
    actionTimeout: 10_000,
  },
  ...desktopEvidence('native'),
  webServer: {
    command: `npm run dev:vite -- --port ${DESKTOP_TEST_PORT}`,
    url: DESKTOP_TEST_ORIGIN,
    reuseExistingServer: !isCI && process.env.STATESET_DESKTOP_TEST_PORT === undefined,
    timeout: 120_000,
  },
  // Project-specific settings
  projects: [
    {
      name: 'electron',
      testMatch: /(electron|computer-chat|startup)\.spec\.ts/,
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
    },
    {
      name: 'accessibility',
      testMatch: /accessibility\.spec\.ts/,
    },
    {
      name: 'integration',
      testMatch: /integration\.spec\.ts/,
    },
  ],
});
