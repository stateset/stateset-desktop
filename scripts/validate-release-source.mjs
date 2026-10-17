#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { resolveReleaseSource } from './release-source.mjs';

try {
  const source = resolveReleaseSource({
    cwd: process.cwd(),
    ref: process.env.GITHUB_REF,
    expectedCommit: process.env.GITHUB_SHA,
    expectedRepository: process.env.GITHUB_REPOSITORY,
  });
  if (process.env.EXPECTED_RELEASE_SHA) {
    assert.equal(
      source.commit,
      process.env.EXPECTED_RELEASE_SHA.toLowerCase(),
      'The workflow source differs from the requested release commit.'
    );
  }
  assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required for release validation.');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${source.version}\ntag=${source.tag}\ncommit=${source.commit}\n`
  );
  console.log(`Validated release source ${source.tag} at ${source.commit}`);
} catch (error) {
  console.error(`Release source validation failed: ${error.message}`);
  process.exitCode = 1;
}
