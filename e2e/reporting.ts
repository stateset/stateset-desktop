import type { PlaywrightTestConfig } from '@playwright/test';

/** Later package checks must retain earlier native failures and their attachments. */
export function desktopEvidence(
  suite: 'native' | 'bundle' | 'distribution'
): Pick<PlaywrightTestConfig, 'outputDir' | 'reporter'> {
  const suffix = suite === 'native' ? '' : `/${suite}`;
  const summary = suite === 'native' ? 'test-results' : `${suite}-results`;
  return {
    outputDir: `test-results${suffix}`,
    reporter: process.env.CI
      ? [
          ['list'],
          ['html', { open: 'never', outputFolder: `playwright-report${suffix}` }],
          ['json', { outputFile: `e2e/${summary}.json` }],
        ]
      : [['list'], ['html', { open: 'never', outputFolder: `playwright-report${suffix}` }]],
  };
}
