import { defineConfig } from '@playwright/test';

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
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'e2e/test-results.json' }]]
    : [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npm run dev:vite',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // Project-specific settings
  projects: [
    {
      name: 'electron',
      testMatch: /electron\.spec\.ts/,
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
      use: {
        // No browser needed for API tests
        baseURL: 'https://engine.stateset.cloud.stateset.app',
      },
    },
  ],
});
