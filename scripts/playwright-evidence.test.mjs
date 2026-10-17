import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));
const playwright = path.join(repository, 'node_modules/@playwright/test');

async function snapshot(directory) {
  const files = new Map();
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(target);
      else
        files.set(
          target,
          createHash('sha256')
            .update(await readFile(target))
            .digest('hex')
        );
    }
  }
  await visit(directory);
  return files;
}

test(
  'native, bundle and distribution runs retain each other’s reports and attachments',
  { timeout: 120_000 },
  async (t) => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'stateset-playwright-evidence-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const fixtures = path.join(temporary, 'fixtures');
    await mkdir(fixtures);
    const protectedFiles = new Map();
    for (const [suite, config] of [
      ['native', 'playwright.config.ts'],
      ['bundle', 'playwright.bundle.config.ts'],
      ['distribution', 'playwright.distribution.config.ts'],
    ]) {
      await writeFile(
        path.join(fixtures, `${suite}.spec.ts`),
        `
import { test } from ${JSON.stringify(path.join(playwright, 'index.js'))};
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test('${suite} evidence', async ({}, info) => {
  const receipt = info.outputPath('receipt.txt');
  await mkdir(path.dirname(receipt), { recursive: true });
  await writeFile(receipt, '${suite} receipt');
  await info.attach('${suite} receipt', { path: receipt, contentType: 'text/plain' });
});
`
      );
      const configuration = path.join(temporary, `${suite}.config.ts`);
      await writeFile(
        configuration,
        `
import original from ${JSON.stringify(path.join(repository, config))};
export default {
  ...original,
  testDir: ${JSON.stringify(fixtures)},
  webServer: undefined,
  retries: 0,
  workers: 1,
  projects: [{ name: '${suite}', testMatch: '${suite}.spec.ts' }],
};
`
      );
      const result = await execute(
        process.execPath,
        [path.join(playwright, 'cli.js'), 'test', '--config', configuration],
        {
          cwd: temporary,
          env: { ...process.env, CI: 'true', PLAYWRIGHT_HTML_OPEN: 'never' },
          timeout: 35_000,
          maxBuffer: 4 * 1024 * 1024,
        }
      );
      assert.match(result.stdout, /1 passed/, `${suite} fixture must execute successfully`);
      for (const [file, hash] of protectedFiles) {
        assert.equal(
          createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
          hash,
          `${suite} run changed earlier evidence: ${path.relative(temporary, file)}`
        );
      }
      const report = path.join(temporary, 'playwright-report', suite === 'native' ? '' : suite);
      const output = path.join(temporary, 'test-results', suite === 'native' ? '' : suite);
      const summary = path.join(
        temporary,
        'e2e',
        suite === 'native' ? 'test-results.json' : `${suite}-results.json`
      );
      assert.equal(JSON.parse(await readFile(summary, 'utf8')).stats.expected, 1);
      assert.ok((await readFile(path.join(report, 'index.html'))).length > 0);
      const receipts = await snapshot(output);
      assert.ok(
        [...receipts.keys()].some((name) => name.endsWith('receipt.txt')),
        `${suite} attachment missing`
      );
      for (const [file, hash] of [...(await snapshot(report)), ...receipts])
        protectedFiles.set(file, hash);
      protectedFiles.set(
        summary,
        createHash('sha256')
          .update(await readFile(summary))
          .digest('hex')
      );
    }
  }
);
