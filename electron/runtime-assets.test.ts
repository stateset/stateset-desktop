import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveTrayIconPath } from './runtime-assets';

describe('resolveTrayIconPath', () => {
  it('prefers tray template assets on macOS in development', () => {
    const appPath = '/workspace/app';
    const existingPaths = new Set([
      path.join(appPath, 'assets', 'tray-icon-template.png'),
      path.join(appPath, 'assets', 'icon.png'),
    ]);

    const resolved = resolveTrayIconPath({
      appPath,
      isPackaged: false,
      platform: 'darwin',
      resourcesPath: '/unused/resources',
      pathExists: (candidatePath) => existingPaths.has(candidatePath),
    });

    expect(resolved).toBe(path.join(appPath, 'assets', 'tray-icon-template.png'));
  });

  it('falls back to icon.png when tray-specific assets are unavailable', () => {
    const appPath = '/workspace/app';
    const existingPaths = new Set([path.join(appPath, 'assets', 'icon.png')]);

    const resolved = resolveTrayIconPath({
      appPath,
      isPackaged: false,
      platform: 'linux',
      resourcesPath: '/unused/resources',
      pathExists: (candidatePath) => existingPaths.has(candidatePath),
    });

    expect(resolved).toBe(path.join(appPath, 'assets', 'icon.png'));
  });

  it('uses packaged resources when the app is bundled', () => {
    const resourcesPath = '/Applications/StateSet.app/Contents/Resources';
    const existingPaths = new Set([path.join(resourcesPath, 'assets', 'icon.png')]);

    const resolved = resolveTrayIconPath({
      appPath: '/Applications/StateSet.app/Contents/Resources/app.asar',
      isPackaged: true,
      platform: 'win32',
      resourcesPath,
      pathExists: (candidatePath) => existingPaths.has(candidatePath),
    });

    expect(resolved).toBe(path.join(resourcesPath, 'assets', 'icon.png'));
  });

  it('returns null when no runtime tray asset exists', () => {
    const resolved = resolveTrayIconPath({
      appPath: '/workspace/app',
      isPackaged: false,
      platform: 'linux',
      resourcesPath: '/unused/resources',
      pathExists: () => false,
    });

    expect(resolved).toBeNull();
  });
});
