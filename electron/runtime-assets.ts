import * as fs from 'fs';
import * as path from 'path';

type RuntimeAssetContext = {
  appPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
  pathExists?: (candidatePath: string) => boolean;
};

function getTrayIconFileNames(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return ['tray-icon-template.png', 'tray-icon.png', 'icon.png'];
  }

  return ['tray-icon.png', 'icon.png'];
}

function getAssetRoots(context: RuntimeAssetContext): string[] {
  if (context.isPackaged) {
    return [path.join(context.resourcesPath, 'assets'), context.resourcesPath];
  }

  return [path.join(context.appPath, 'assets')];
}

export function resolveTrayIconPath(context: RuntimeAssetContext): string | null {
  const pathExists = context.pathExists ?? fs.existsSync;
  const fileNames = getTrayIconFileNames(context.platform);
  const roots = getAssetRoots(context);

  for (const root of roots) {
    for (const fileName of fileNames) {
      const candidatePath = path.join(root, fileName);
      if (pathExists(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}
