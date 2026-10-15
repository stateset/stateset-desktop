import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { collectReleaseAssets } from './collect-release-assets.mjs';

const version = '1.1.18';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stateset-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'artifacts');
  await mkdir(source);
  const destination = path.join(root, 'release-assets');
  const entries = [
    ['macos-builds', 'latest-mac.yml', `StateSet-${version}-mac-arm64.zip`],
    ['windows-builds', 'latest.yml', `StateSet-${version}-win-x64.exe`],
    ['linux-builds', 'latest-linux.yml', `StateSet-${version}-x86_64.AppImage`],
  ];
  for (const [platform, manifestName, name] of entries) {
    const directory = path.join(source, platform);
    await mkdir(directory);
    const bytes = Buffer.from(`installer:${platform}`);
    await writeFile(path.join(directory, name), bytes);
    const sha512 = createHash('sha512').update(bytes).digest('base64');
    await writeFile(
      path.join(directory, manifestName),
      yaml.dump({
        version,
        files: [{ url: name, sha512, size: bytes.length }],
        path: name,
        sha512,
      })
    );
  }
  const manifestPath = path.join(source, 'windows-builds', 'latest.yml');
  const mutate = async (fn) => {
    const manifest = yaml.load(await readFile(manifestPath, 'utf8'));
    fn(manifest);
    await writeFile(manifestPath, yaml.dump(manifest));
  };
  const collect = () => collectReleaseAssets(source, destination, version);
  return { source, destination, entries, mutate, collect, manifestPath };
}

test('preserves manifest URLs and blockmap names and produces matching public checksums', async (t) => {
  const { source, destination, entries, collect } = await fixture(t);
  const blockmap = entries[1][2] + '.blockmap';
  await writeFile(path.join(source, 'windows-builds', blockmap), 'blockmap');
  await mkdir(path.join(source, 'playwright-artifacts'));
  await writeFile(path.join(source, 'playwright-artifacts', 'private.zip'), 'not a release asset');
  const result = await collect();
  assert.equal(result.version, version);
  assert.equal(result.manifests.length, 3);
  const output = await readdir(destination);
  assert(output.includes(blockmap));
  assert(!output.includes('private.zip'));
  for (const [, manifest, binary] of entries) {
    assert(output.includes(binary));
    assert.equal(yaml.load(await readFile(path.join(destination, manifest), 'utf8')).path, binary);
  }
  for (const line of (await readFile(path.join(destination, 'SHA256SUMS'), 'utf8'))
    .trim()
    .split('\n')) {
    const [digest, name] = line.split('  ');
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(destination, name)))
        .digest('hex'),
      digest
    );
  }
  await assert.rejects(collect(), /EEXIST/);
});

test('rejects renamed installers before creating publishable output', async (t) => {
  const { source, destination, entries, collect } = await fixture(t);
  const name = entries[1][2];
  await writeFile(path.join(source, 'windows-builds', 'windows-builds-' + name), 'renamed');
  await rm(path.join(source, 'windows-builds', name));
  await assert.rejects(collect(), /another platform|missing asset/);
  await assert.rejects(readdir(destination), /ENOENT/);
});

test('rejects modified installer bytes even when the filename is unchanged', async (t) => {
  const { source, entries, collect } = await fixture(t);
  await writeFile(path.join(source, 'windows-builds', entries[1][2]), 'tampered');
  await assert.rejects(collect(), /SHA-512 mismatch/);
});

test('rejects duplicate names instead of overwriting another platform', async (t) => {
  const { source, entries, collect } = await fixture(t);
  await writeFile(path.join(source, 'linux-builds', entries[1][2]), 'duplicate');
  await assert.rejects(collect(), /Duplicate release filename/);
});

for (const [label, change, reason] of [
  [
    'incorrect version',
    (m) => {
      m.version = '0.0.1';
    },
    /release version mismatch/,
  ],
  [
    'incorrect size',
    (m) => {
      m.files[0].size++;
    },
    /size mismatch/,
  ],
  [
    'unsafe URL',
    (m) => {
      m.files[0].url = '../outside.exe';
    },
    /Unsafe updater filename/,
  ],
  [
    'encoded traversal',
    (m) => {
      m.files[0].url = '..%2Foutside.exe';
    },
    /Unsafe updater filename/,
  ],
  [
    'empty file list',
    (m) => {
      m.files = [];
    },
    /no updater files/,
  ],
  [
    'broken legacy path',
    (m) => {
      m.path = 'missing.exe';
    },
    /legacy path is absent/,
  ],
  [
    'missing hash',
    (m) => {
      delete m.files[0].sha512;
    },
    /missing SHA-512/,
  ],
]) {
  test(`rejects manifest with ${label}`, async (t) => {
    const { mutate, collect } = await fixture(t);
    await mutate(change);
    await assert.rejects(collect(), reason);
  });
}

test('requires all three platforms and their updater manifests', async (t) => {
  const { manifestPath, collect } = await fixture(t);
  await rm(manifestPath);
  await assert.rejects(collect(), /No updater manifest/);
});

test('refuses symlinks as release assets', async (t) => {
  const { source, collect } = await fixture(t);
  await symlink('latest.yml', path.join(source, 'windows-builds', 'unexpected.zip'));
  await assert.rejects(collect(), /regular files/);
});
