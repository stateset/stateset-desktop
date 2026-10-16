import { describe, expect, it } from 'vitest';
import { dashboardLocation, shouldUseHashRouting } from './lib/routing';

describe('shouldUseHashRouting', () => {
  it('uses hash routing for packaged Electron file URLs', () => {
    expect(shouldUseHashRouting(true, 'file:')).toBe(true);
  });

  it('uses browser routing for Electron dev URLs', () => {
    expect(shouldUseHashRouting(true, 'http:')).toBe(false);
  });

  it('uses browser routing outside Electron', () => {
    expect(shouldUseHashRouting(false, 'file:')).toBe(false);
  });
});

describe('dashboardLocation', () => {
  it.each([
    [
      'file:///opt/StateSet/resources/app.asar/dist/renderer/index.html#/settings?tab=appearance',
      'file:///opt/StateSet/resources/app.asar/dist/renderer/index.html#/',
    ],
    [
      'file:///C:/Program%20Files/StateSet/resources/app.asar/dist/renderer/index.html#/agent/one',
      'file:///C:/Program%20Files/StateSet/resources/app.asar/dist/renderer/index.html#/',
    ],
    ['http://localhost:3000/agent/one?view=logs#section', 'http://localhost:3000/'],
    ['https://desktop.example/settings?tab=appearance', 'https://desktop.example/'],
  ])('returns to the dashboard safely from %s', (source, destination) => {
    expect(dashboardLocation(source)).toBe(destination);
  });
});
