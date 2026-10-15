import { defineConfig } from '@playwright/test';
import bundle from './playwright.bundle.config';

export default defineConfig({
  ...bundle,
  projects: [{ name: 'distribution', testMatch: /distribution\.spec\.ts/ }],
});
