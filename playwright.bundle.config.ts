import { defineConfig } from '@playwright/test';
import desktop from './playwright.config';

export default defineConfig({
  ...desktop,
  webServer: undefined,
  projects: [{ name: 'bundle', testMatch: /bundle\.spec\.ts/ }],
});
