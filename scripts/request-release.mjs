#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkoutCommit, readReleaseMetadata, resolveReleaseSource } from './release-source.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: npm run release [-- --dry-run]\nRequires a clean checkout matching the pushed version tag. Publication runs through GitHub Actions signing and installer verification.'
    );
  } else {
    assert.ok(
      args.length === 0 || (args.length === 1 && args[0] === '--dry-run'),
      'Usage: npm run release [-- --dry-run]'
    );
    const cwd = process.cwd();
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim(),
      '',
      'Commit all source changes before requesting a release.'
    );
    const metadata = readReleaseMetadata(cwd);
    const source = resolveReleaseSource({
      cwd,
      ref: `refs/tags/${metadata.tag}`,
      expectedCommit: checkoutCommit(cwd),
      expectedRepository: metadata.repository,
    });
    const command = [
      'workflow',
      'run',
      'build-release.yml',
      '--repo',
      source.repository,
      '--ref',
      source.tag,
      '-f',
      'release=true',
      '-f',
      `source_sha=${source.commit}`,
    ];
    if (args[0] === '--dry-run') {
      console.log(JSON.stringify({ ...source, command: ['gh', ...command] }, null, 2));
    } else {
      execFileSync('gh', command, { cwd, stdio: 'inherit' });
      console.log(
        `Requested signed release ${source.tag} from ${source.commit}. Watch the GitHub Actions run for publication results.`
      );
    }
  }
} catch (error) {
  console.error(`Release request failed: ${error.message}`);
  process.exitCode = 1;
}
