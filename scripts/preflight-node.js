#!/usr/bin/env node

/*
  This repo's dev/test toolchain requires modern Node.
  We require Node 22.12+ to match our build tooling (electron-builder/app-builder-lib) engines.
*/

const requiredMajor = 22;
const requiredMinor = 12;
const requiredPatch = 0;
const rawVersion = process.versions?.node ?? '';
const [majorRaw, minorRaw, patchRaw] = rawVersion.split('.');
const major = Number.parseInt(majorRaw ?? '', 10);
const minor = Number.parseInt(minorRaw ?? '', 10);
const patch = Number.parseInt(patchRaw ?? '', 10);

const meetsRequirement =
  Number.isFinite(major) &&
  Number.isFinite(minor) &&
  Number.isFinite(patch) &&
  (major > requiredMajor ||
    (major === requiredMajor &&
      (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch))));

if (!meetsRequirement) {
  // Keep this message copy-pastable and actionable.
  // eslint-disable-next-line no-console
  console.error(
    [
      `StateSet Desktop requires Node.js ${requiredMajor}.${requiredMinor}+.`,
      `Detected Node.js ${rawVersion || '(unknown)'}.`,
      '',
      'Fix:',
      '- If you use nvm: `nvm use` (uses .nvmrc) or `nvm install 22 && nvm use 22`',
      '- Otherwise: install Node.js 22 LTS and re-run your command',
    ].join('\n')
  );
  process.exit(1);
}
