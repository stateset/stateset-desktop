import { defineConfig } from '@playwright/test';
import { desktopEvidence } from './e2e/reporting';
import desktop from './playwright.config';

export default defineConfig({
  ...desktop,
  ...desktopEvidence('bundle'),
  webServer: undefined,
  projects: [{ name: 'bundle', testMatch: /bundle\.spec\.ts/ }],
});
