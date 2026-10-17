import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const commitPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+([\da-z-]+(?:\.[\da-z-]+)*))?$/i;

function git(cwd, args, message) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(message);
  }
}

export function readReleaseMetadata(cwd) {
  const metadata = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  const match = typeof metadata.version === 'string' && metadata.version.match(versionPattern);
  assert.ok(match, 'package.json must contain a valid release version.');
  assert.ok(
    !match[4]?.split('.').some((part) => /^0\d+$/.test(part)),
    'Numeric prerelease identifiers cannot start with zero.'
  );
  const publish = metadata.build?.publish;
  assert.equal(
    publish?.provider,
    'github',
    'Configure the GitHub release repository in package.json.'
  );
  for (const part of [publish.owner, publish.repo]) {
    assert.ok(
      typeof part === 'string' && /^[\w.-]+$/.test(part) && part !== '.' && part !== '..',
      'Configure a valid GitHub release owner and repository.'
    );
  }
  return {
    version: metadata.version,
    tag: `v${metadata.version}`,
    repository: `${publish.owner}/${publish.repo}`,
  };
}

export function validateReleaseReference(ref, version) {
  assert.equal(
    ref,
    `refs/tags/v${version}`,
    'Published releases must run from the existing version tag, never from a branch.'
  );
}

export function parseRemoteTag(output, tag) {
  const entries = new Map();
  const ref = `refs/tags/${tag}`;
  for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
    const parts = line.split('\t');
    assert.ok(parts.length === 2 && commitPattern.test(parts[0]), 'Invalid remote tag response.');
    assert.ok(
      parts[1] === ref || parts[1] === `${ref}^{}`,
      'Unexpected reference in remote tag response.'
    );
    assert.ok(!entries.has(parts[1]), 'Ambiguous remote tag response.');
    entries.set(parts[1], parts[0].toLowerCase());
  }
  assert.ok(
    entries.has(ref),
    'The version tag is missing from origin. Push it before requesting a release.'
  );
  return entries.get(`${ref}^{}`) ?? entries.get(ref);
}

export function checkoutCommit(cwd) {
  return git(
    cwd,
    ['rev-parse', 'HEAD'],
    'Cannot read the checked-out release commit.'
  ).toLowerCase();
}

export function resolveReleaseSource({ cwd, ref, expectedCommit, expectedRepository }) {
  const metadata = readReleaseMetadata(cwd);
  validateReleaseReference(ref, metadata.version);
  assert.ok(
    typeof expectedRepository === 'string' &&
      expectedRepository.toLowerCase() === metadata.repository.toLowerCase(),
    'The workflow repository must match the configured release repository.'
  );
  assert.ok(
    typeof expectedCommit === 'string' && commitPattern.test(expectedCommit),
    'A valid expected source commit is required.'
  );
  const head = checkoutCommit(cwd);
  assert.equal(
    head,
    expectedCommit.toLowerCase(),
    'The checkout does not match the requested source commit.'
  );
  const clean = () =>
    assert.equal(
      git(
        cwd,
        ['status', '--porcelain', '--untracked-files=no'],
        'Cannot inspect release source changes.'
      ),
      '',
      'Commit tracked changes before requesting a release.'
    );
  clean();
  const remote = git(
    cwd,
    ['ls-remote', '--tags', 'origin', `refs/tags/${metadata.tag}`, `refs/tags/${metadata.tag}^{}`],
    'Cannot read the remote release tag. Check origin access and push the version tag.'
  );
  assert.equal(
    parseRemoteTag(remote, metadata.tag),
    head,
    'The remote version tag does not point to the checked-out source commit.'
  );
  assert.equal(checkoutCommit(cwd), head, 'The checkout changed during release validation.');
  clean();
  return { ...metadata, commit: head };
}

export const SIGNING_SECRET_NAMES = Object.freeze([
  'MAC_CERTS',
  'MAC_CERTS_PASSWORD',
  'APPLE_ID',
  'APPLE_ID_PASSWORD',
  'APPLE_TEAM_ID',
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
]);

export function validateSigningConfiguration(environment) {
  const missing = SIGNING_SECRET_NAMES.filter(
    (name) => typeof environment[name] !== 'string' || !environment[name].trim()
  );
  assert.equal(
    missing.length,
    0,
    `Missing GitHub signing secrets: ${missing.join(', ')}. Configure them before requesting installer publication.`
  );
}
