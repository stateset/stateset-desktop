import { defineConfig } from '@playwright/test';
import { desktopEvidence } from './e2e/reporting';
import bundle from './playwright.bundle.config';

export default defineConfig({
  ...bundle,
  ...desktopEvidence('distribution'),
  projects: [{ name: 'distribution', testMatch: /distribution\.spec\.ts/ }],
});
