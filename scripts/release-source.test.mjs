import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  checkoutCommit,
  parseRemoteTag,
  readReleaseMetadata,
  resolveReleaseSource,
} from './release-source.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'stateset/stateset-desktop';
const sha = 'a'.repeat(40);
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(
  t,
  { annotated = true, published = true, version = '1.2.3', entrypoints = false } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'stateset-release-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'checkout');
  const remote = join(root, 'origin.git');
  mkdirSync(cwd);
  git(root, 'init', '--bare', '--quiet', remote);
  git(cwd, 'init', '--quiet');
  git(cwd, 'config', 'user.name', 'Release fixture');
  git(cwd, 'config', 'user.email', 'release-fixture@example.invalid');
  const metadata = entrypoints
    ? JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
    : { build: { publish: { provider: 'github', owner: 'stateset', repo: 'stateset-desktop' } } };
  metadata.version = version;
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(metadata));
  writeFileSync(join(cwd, 'tracked.txt'), 'Original source\n');
  if (entrypoints) {
    mkdirSync(join(cwd, 'scripts'));
    for (const file of ['preflight-node.js', 'release-source.mjs', 'request-release.mjs'])
      writeFileSync(join(cwd, 'scripts', file), readFileSync(join(project, 'scripts', file)));
  }
  git(cwd, 'add', '.');
  git(cwd, 'commit', '--quiet', '-m', 'Fixture source');
  const commit = checkoutCommit(cwd);
  const tag = `v${version}`;
  if (annotated) git(cwd, 'tag', '-a', tag, '-m', 'Fixture version');
  else git(cwd, 'tag', tag);
  git(cwd, 'remote', 'add', 'origin', remote);
  git(cwd, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
  if (published) git(cwd, 'push', '--quiet', 'origin', `refs/tags/${tag}`);
  return { root, cwd, commit, tag };
}

const inspect = (f, overrides = {}) =>
  resolveReleaseSource({
    cwd: f.cwd,
    ref: `refs/tags/${f.tag}`,
    expectedCommit: f.commit,
    expectedRepository: repository,
    ...overrides,
  });

for (const annotated of [true, false]) {
  test(`accepts a pushed ${annotated ? 'annotated' : 'lightweight'} tag matching the checkout`, (t) => {
    const f = fixture(t, { annotated });
    assert.deepEqual(inspect(f), { version: '1.2.3', tag: f.tag, repository, commit: f.commit });
  });
}
for (const ref of ['refs/heads/main', 'refs/heads/v1.2.3', 'refs/pull/1/merge', '', undefined]) {
  test(`rejects a non-tag publishing reference: ${String(ref)}`, (t) => {
    assert.throws(() => inspect(fixture(t), { ref }), /existing version tag/);
  });
}
test('rejects a version tag different from package metadata', (t) =>
  assert.throws(() => inspect(fixture(t), { ref: 'refs/tags/v1.2.2' }), /existing version tag/));
test('rejects a version tag that has not been pushed', (t) =>
  assert.throws(() => inspect(fixture(t, { published: false })), /missing from origin/));
test('rejects a checkout that advanced beyond the pushed version tag', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, 'tracked.txt'), 'New source\n');
  git(f.cwd, 'commit', '--quiet', '-am', 'Advance source');
  assert.throws(
    () => inspect(f, { expectedCommit: checkoutCommit(f.cwd) }),
    /remote version tag does not point/
  );
});
test('rejects a workflow repository different from the configured publisher', (t) =>
  assert.throws(
    () => inspect(fixture(t), { expectedRepository: 'another/repository' }),
    /repository must match/
  ));
test('rejects a checkout different from the requested commit', (t) =>
  assert.throws(() => inspect(fixture(t), { expectedCommit: sha }), /checkout does not match/));
test('rejects missing source-commit context', (t) =>
  assert.throws(
    () => inspect(fixture(t), { expectedCommit: undefined }),
    /expected source commit/
  ));
for (const staged of [false, true]) {
  test(`rejects ${staged ? 'staged' : 'unstaged'} source edits`, (t) => {
    const f = fixture(t);
    writeFileSync(join(f.cwd, 'tracked.txt'), 'Uncommitted source\n');
    if (staged) git(f.cwd, 'add', 'tracked.txt');
    assert.throws(() => inspect(f), /Commit tracked changes/);
  });
}
test('reports an unavailable origin without exposing remote diagnostics', (t) => {
  const f = fixture(t);
  git(f.cwd, 'remote', 'set-url', 'origin', join(f.root, 'missing-origin'));
  assert.throws(() => inspect(f), {
    message: 'Cannot read the remote release tag. Check origin access and push the version tag.',
  });
});
for (const output of [
  `${sha}\trefs/heads/v1.2.3`,
  `${sha}\trefs/tags/v1.2.3\n${sha}\trefs/tags/v1.2.3`,
  `${sha}\trefs/tags/v1.2.3^{}`,
  `invalid\trefs/tags/v1.2.3`,
]) {
  test(`rejects malformed or ambiguous remote tag output: ${output.slice(0, 12)}`, () =>
    assert.throws(() => parseRemoteTag(output, 'v1.2.3')));
}
for (const version of ['01.2.3', '1.2.3-01', '1.2.3\ninjected=value', '../1.2.3']) {
  test(`rejects invalid release metadata: ${JSON.stringify(version)}`, (t) => {
    const f = fixture(t);
    const metadata = JSON.parse(readFileSync(join(f.cwd, 'package.json'), 'utf8'));
    metadata.version = version;
    writeFileSync(join(f.cwd, 'package.json'), JSON.stringify(metadata));
    assert.throws(() => readReleaseMetadata(f.cwd));
  });
}
test('supports prerelease and build metadata in a valid tag', (t) =>
  assert.equal(
    inspect(fixture(t, { version: '1.2.3-beta.1+build.02' })).version,
    '1.2.3-beta.1+build.02'
  ));
test('release dry-run produces an exact tag and source-pinned workflow request', (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/request-release.mjs'), '--dry-run'],
    { cwd: f.cwd, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.commit, f.commit);
  assert.deepEqual(plan.command, [
    'gh',
    'workflow',
    'run',
    'build-release.yml',
    '--repo',
    repository,
    '--ref',
    f.tag,
    '-f',
    'release=true',
    '-f',
    `source_sha=${f.commit}`,
  ]);
});
test('release request rejects untracked source files', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, 'untracked-source.js'), 'Unexpected source');
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/request-release.mjs'), '--dry-run'],
    { cwd: f.cwd, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Commit all source changes/);
});
test('release request rejects unknown publisher flags', (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/request-release.mjs'), '--publish', 'always'],
    { cwd: f.cwd, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
test('CI preflight emits only the validated version, tag and source commit', (t) => {
  const f = fixture(t);
  const output = join(f.root, 'output');
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/validate-release-source.mjs')],
    {
      cwd: f.cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF: `refs/tags/${f.tag}`,
        GITHUB_SHA: f.commit,
        GITHUB_REPOSITORY: repository,
        GITHUB_OUTPUT: output,
        EXPECTED_RELEASE_SHA: f.commit,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), `version=1.2.3\ntag=${f.tag}\ncommit=${f.commit}\n`);
});
test('CI preflight rejects a request pinned to another commit before emitting outputs', (t) => {
  const f = fixture(t);
  const output = join(f.root, 'output');
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/validate-release-source.mjs')],
    {
      cwd: f.cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF: `refs/tags/${f.tag}`,
        GITHUB_SHA: f.commit,
        GITHUB_REPOSITORY: repository,
        GITHUB_OUTPUT: output,
        EXPECTED_RELEASE_SHA: sha,
      },
    }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from the requested release commit/);
  assert.equal(existsSync(output), false);
});
test('npm release dry-run uses the guarded workflow without build dependencies', (t) => {
  const f = fixture(t, { entrypoints: true });
  const result = spawnSync('npm', ['run', 'release', '--', '--dry-run'], {
    cwd: f.cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`source_sha=${f.commit}`));
  assert.equal(existsSync(join(f.cwd, 'release')), false);
});

test('signing presence checks accept a complete configuration without claiming certificate validity', async () => {
  const { SIGNING_SECRET_NAMES, validateSigningConfiguration } =
    await import('./release-source.mjs');
  assert.doesNotThrow(() =>
    validateSigningConfiguration(
      Object.fromEntries(SIGNING_SECRET_NAMES.map((name) => [name, 'fixture-secret-value']))
    )
  );
});
test('signing presence checks name missing GitHub settings without exposing supplied values', async () => {
  const { SIGNING_SECRET_NAMES, validateSigningConfiguration } =
    await import('./release-source.mjs');
  const environment = Object.fromEntries(
    SIGNING_SECRET_NAMES.map((name) => [name, 'fixture-secret-value'])
  );
  delete environment.MAC_CERTS;
  environment.WIN_CSC_LINK = '  ';
  assert.throws(
    () => validateSigningConfiguration(environment),
    (error) => {
      assert.match(error.message, /MAC_CERTS, WIN_CSC_LINK/);
      assert.doesNotMatch(error.message, /fixture-secret-value/);
      return true;
    }
  );
});

test('signing CLI reports missing setting names without printing configured secrets', async () => {
  const { SIGNING_SECRET_NAMES } = await import('./release-source.mjs');
  const environment = {
    ...process.env,
    ...Object.fromEntries(SIGNING_SECRET_NAMES.map((name) => [name, 'fixture-secret-value'])),
  };
  environment.MAC_CERTS = '';
  const result = spawnSync(
    process.execPath,
    [join(project, 'scripts/validate-release-signing.mjs')],
    { encoding: 'utf8', env: environment }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing GitHub signing secrets: MAC_CERTS/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-value/);
});
