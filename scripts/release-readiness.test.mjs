import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseReadiness } from './release-readiness.mjs';

const sha = 'a'.repeat(40);
function fixture(
  t,
  {
    dirty = false,
    signing = 'success',
    complete = true,
    wrongRun = false,
    omitRelease = false,
  } = {}
) {
  const cwd = mkdtempSync(join(tmpdir(), 'stateset-release-readiness-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({
      version: '1.2.3',
      build: { publish: { provider: 'github', owner: 'stateset', repo: 'stateset-desktop' } },
    })
  );
  writeFileSync(
    join(cwd, 'package-lock.json'),
    JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } })
  );
  writeFileSync(join(cwd, 'RELEASE_NOTES_v1.2.3.md'), 'Fixture notes');
  const calls = [];
  const execute = (tool, args) => {
    calls.push([tool, ...args]);
    if (tool === 'git') {
      if (args[0] === 'status') return dirty ? ' M package.json\n' : '';
      if (args[0] === 'rev-parse') return sha;
      if (args[0] === 'ls-remote')
        return `${'b'.repeat(40)}\trefs/tags/v1.2.3\n${sha}\trefs/tags/v1.2.3^{}\n`;
    }
    if (tool === 'gh' && args[1] === 'list')
      return JSON.stringify([
        {
          databaseId: 123,
          headSha: wrongRun ? 'c'.repeat(40) : sha,
          headBranch: 'v1.2.3',
          event: 'push',
          status: 'completed',
          conclusion: 'success',
        },
      ]);
    if (tool === 'gh' && args[1] === 'view')
      return JSON.stringify({
        status: complete ? 'completed' : 'in_progress',
        conclusion: complete ? 'success' : '',
        jobs: [
          {
            name: 'test',
            steps: [{ name: 'Check required signing settings', conclusion: signing }],
          },
          ...[
            'build-macos',
            'build-windows',
            'build-linux',
            ...(omitRelease ? [] : ['release']),
          ].map((name) => ({ name, conclusion: 'success' })),
        ],
      });
    throw new Error('Unexpected read');
  };
  return { cwd, execute, calls };
}
test('local inspection never requests GitHub or claims uninspected signing readiness', (t) => {
  const f = fixture(t);
  const report = releaseReadiness(f);
  assert.equal(report.ready_to_request_publication, false);
  assert.equal(report.installer_publication_verified, false);
  assert.ok(
    f.calls.every(([tool, command]) => tool === 'git' && ['rev-parse', 'status'].includes(command))
  );
});
test('accepts only matching tag, commit, signing and completed platform publication evidence', (t) => {
  const report = releaseReadiness({ ...fixture(t), github: true });
  assert.equal(report.ready_to_request_publication, true);
  assert.equal(report.installer_publication_verified, true);
  assert.equal(report.workflow.id, 123);
});
test('reports a signing failure without looking up secret values or publishing', (t) => {
  const f = fixture(t, { signing: 'failure' });
  const report = releaseReadiness({ ...f, github: true });
  assert.equal(report.ready_to_request_publication, false);
  assert.equal(report.installer_publication_verified, false);
  assert.match(
    report.checks.find((c) => c.key === 'signing').message,
    /MAC_CERTS.*WIN_CSC_KEY_PASSWORD/
  );
  assert.ok(
    f.calls.every(
      ([tool, command, subcommand]) =>
        tool === 'git' ||
        (tool === 'gh' && command === 'run' && ['list', 'view'].includes(subcommand))
    )
  );
});
for (const options of [{ dirty: true }, { wrongRun: true }])
  test(`does not accept unrelated or changed source: ${JSON.stringify(options)}`, (t) => {
    const report = releaseReadiness({ ...fixture(t, options), github: true });
    assert.equal(report.ready_to_request_publication, false);
    assert.equal(report.installer_publication_verified, false);
  });
for (const options of [{ complete: false }, { omitRelease: true }])
  test(`does not equate successful signing or partial builds with publication: ${JSON.stringify(options)}`, (t) => {
    assert.equal(
      releaseReadiness({ ...fixture(t, options), github: true }).installer_publication_verified,
      false
    );
  });
test('rejects mismatched lock versions while still collecting other actionable checks', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, 'package-lock.json'), JSON.stringify({ version: '0.0.1' }));
  const report = releaseReadiness({ ...f, github: true });
  assert.equal(report.checks.find((c) => c.key === 'versions').status, 'fail');
  assert.ok(report.checks.some((c) => c.key === 'signing'));
  assert.equal(report.ready_to_request_publication, false);
});
test('fails closed on unavailable remote evidence and does not echo backend error bodies', (t) => {
  const f = fixture(t);
  const original = f.execute;
  f.execute = (tool, args) => {
    if (tool === 'gh') throw new Error('private backend response');
    return original(tool, args);
  };
  const report = releaseReadiness({ ...f, github: true });
  assert.equal(report.ready_to_request_publication, false);
  assert.equal(report.installer_publication_verified, false);
  assert.doesNotMatch(JSON.stringify(report), /private backend response/);
});
for (const missing of [true, false])
  test(`does not approve missing or empty release notes (${missing})`, (t) => {
    const f = fixture(t);
    const notes = join(f.cwd, 'RELEASE_NOTES_v1.2.3.md');
    if (missing) rmSync(notes);
    else writeFileSync(notes, '  \n');
    const report = releaseReadiness({ ...f, github: true });
    assert.equal(report.checks.find((c) => c.key === 'versions').status, 'pass');
    assert.equal(report.checks.find((c) => c.key === 'notes').status, 'fail');
    assert.equal(report.ready_to_request_publication, false);
  });
