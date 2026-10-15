#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const platforms = ['macos-builds', 'windows-builds', 'linux-builds'];
const isAsset = (name) => /\.(?:dmg|zip|exe|AppImage|deb|yml|blockmap)$/.test(name);
const isManifest = (name) => /^(?:latest|beta|alpha)(?:-[a-z0-9-]+)?\.yml$/.test(name);

function assetName(value) {
  assert.equal(typeof value, 'string', 'Updater filenames must be strings');
  const name = decodeURIComponent(value);
  assert(/^[A-Za-z0-9][A-Za-z0-9._+ -]*$/.test(name), `Unsafe updater filename: ${value}`);
  assert.equal(path.basename(name), name, 'Updater URLs must reference sibling release assets');
  return name;
}

/** Preserve builder filenames: update manifests and blockmaps refer to these exact names. */
export async function collectReleaseAssets(source, destination, version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/, 'Invalid release version');
  const assets = new Map();
  const manifests = [];
  for (const platform of platforms) {
    const directory = path.join(source, platform);
    assert((await lstat(directory)).isDirectory(), `Missing artifact directory: ${platform}`);
    let manifestCount = 0;
    let binaryCount = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!isAsset(entry.name)) continue;
      assert.equal(
        assetName(entry.name),
        entry.name,
        'Release filenames must be plain sibling names'
      );
      assert(entry.isFile(), `Release assets must be regular files: ${entry.name}`);
      assert(!assets.has(entry.name), `Duplicate release filename: ${entry.name}`);
      const filename = path.join(directory, entry.name);
      const info = await lstat(filename);
      assert(info.size > 0, `Empty release asset: ${entry.name}`);
      assets.set(entry.name, { filename, size: info.size });
      if (entry.name.endsWith('.yml')) {
        assert(isManifest(entry.name), `Unexpected updater manifest: ${entry.name}`);
        manifests.push({ name: entry.name, platform });
        manifestCount++;
      } else if (!entry.name.endsWith('.blockmap')) binaryCount++;
    }
    assert(binaryCount > 0, `No installers in ${platform}`);
    assert(manifestCount > 0, `No updater manifest in ${platform}`);
  }

  const digest = async (name, algorithm, encoding) => {
    const { createReadStream } = await import('node:fs');
    const hash = createHash(algorithm);
    for await (const bytes of createReadStream(assets.get(name).filename)) hash.update(bytes);
    return hash.digest(encoding);
  };
  const hashes = new Map();
  const verify = async (reference, sha512, size, manifest) => {
    const name = assetName(reference);
    assert(
      assets.has(name) && !name.endsWith('.yml'),
      `${manifest} references missing asset: ${name}`
    );
    assert.equal(typeof sha512, 'string', `${manifest}: missing SHA-512 for ${name}`);
    assert.equal(
      Buffer.from(sha512, 'base64').length,
      64,
      `${manifest}: invalid SHA-512 for ${name}`
    );
    if (!hashes.has(name)) hashes.set(name, await digest(name, 'sha512', 'base64'));
    assert.equal(sha512, hashes.get(name), `${manifest}: SHA-512 mismatch for ${name}`);
    if (size !== undefined)
      assert.equal(size, assets.get(name).size, `${manifest}: size mismatch for ${name}`);
  };
  for (const { name, platform } of manifests) {
    const manifest = yaml.load(await readFile(assets.get(name).filename, 'utf8'), {
      schema: yaml.JSON_SCHEMA,
    });
    assert(manifest && typeof manifest === 'object', `Invalid updater manifest: ${name}`);
    assert.equal(manifest.version, version, `${name}: release version mismatch`);
    assert(Array.isArray(manifest.files) && manifest.files.length > 0, `${name}: no updater files`);
    for (const file of manifest.files) {
      assert(file && typeof file === 'object', `${name}: invalid updater file`);
      const referenced = assetName(file.url);
      assert.equal(
        path.dirname(assets.get(referenced)?.filename ?? ''),
        path.join(source, platform),
        `${name}: asset belongs to another platform`
      );
      await verify(file.url, file.sha512, file.size, name);
    }
    if (manifest.path !== undefined) {
      assert(
        manifest.files.some((file) => assetName(file.url) === assetName(manifest.path)),
        `${name}: legacy path is absent from files`
      );
      await verify(manifest.path, manifest.sha512, undefined, name);
    }
  }

  // Validate every manifest before creating any publishable output.
  await mkdir(destination); // Refuse to merge into stale assets from an earlier release.
  const checksums = [];
  const files = [];
  for (const [name, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    const target = path.join(destination, name);
    await copyFile(asset.filename, target);
    checksums.push(`${await digest(name, 'sha256', 'hex')}  ${name}`);
    files.push(target);
  }
  const checksumFile = path.join(destination, 'SHA256SUMS');
  await writeFile(checksumFile, checksums.join('\n') + '\n', { flag: 'wx' });
  files.push(checksumFile);
  return { version, files, manifests: manifests.map(({ name }) => name) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source = 'artifacts', destination = 'release-assets', version] = process.argv.slice(2);
    assert(
      version,
      'Usage: node scripts/collect-release-assets.mjs artifacts release-assets VERSION'
    );
    const result = await collectReleaseAssets(source, destination, version);
    if (process.env.GITHUB_OUTPUT) {
      await writeFile(
        process.env.GITHUB_OUTPUT,
        `files<<STATESET_RELEASE_FILES\n${result.files.join('\n')}\nSTATESET_RELEASE_FILES\n`,
        { flag: 'a' }
      );
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
