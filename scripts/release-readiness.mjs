#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readReleaseMetadata, parseRemoteTag, SIGNING_SECRET_NAMES } from './release-source.mjs';

/** Read-only diagnostics. Never read secret values, change tags, dispatch CI or publish assets. */
export function releaseReadiness({
  cwd = process.cwd(),
  github = false,
  execute = execFileSync,
} = {}) {
  const checks = [];
  const add = (key, status, message) => checks.push({ key, status, message });
  const run = (tool, args) =>
    execute(tool, args, {
      cwd,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let metadata;
  let commit;
  let workflow;
  try {
    metadata = readReleaseMetadata(cwd);
    const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
    add(
      'versions',
      lock.version === metadata.version && lock.packages?.['']?.version === metadata.version
        ? 'pass'
        : 'fail',
      'Package and lockfile versions must agree.'
    );
    let notesPresent = false;
    try {
      notesPresent =
        readFileSync(join(cwd, `RELEASE_NOTES_${metadata.tag}.md`), 'utf8').trim().length > 0;
    } catch {
      /* Report missing or unreadable notes independently of package metadata. */
    }
    add(
      'notes',
      notesPresent ? 'pass' : 'fail',
      'Keep nonempty versioned release notes with the tagged source.'
    );
  } catch {
    add('versions', 'fail', 'Valid package metadata and matching lockfile versions are required.');
  }
  try {
    commit = run('git', ['rev-parse', 'HEAD']);
    if (!/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(commit)) throw new Error('Invalid commit');
    add(
      'clean_source',
      run('git', ['status', '--porcelain']) === '' ? 'pass' : 'fail',
      'Commit all source changes, including new files, before requesting publication.'
    );
  } catch {
    commit = undefined;
    add('clean_source', 'fail', 'The current Git source could not be inspected.');
  }
  if (metadata && commit) {
    try {
      const tagCommit = run('git', ['rev-parse', '--verify', `refs/tags/${metadata.tag}^{commit}`]);
      add(
        'local_tag',
        tagCommit === commit ? 'pass' : 'fail',
        'The local version tag must point to the current commit.'
      );
    } catch {
      add('local_tag', 'fail', 'Create the matching version tag on the release commit.');
    }
  }
  let published = false;
  if (github && metadata && commit) {
    try {
      const tagCommit = parseRemoteTag(
        run('git', [
          'ls-remote',
          '--tags',
          'origin',
          `refs/tags/${metadata.tag}`,
          `refs/tags/${metadata.tag}^{}`,
        ]),
        metadata.tag
      );
      add(
        'remote_tag',
        tagCommit === commit ? 'pass' : 'fail',
        'The pushed version tag must point to the current commit.'
      );
    } catch {
      add(
        'remote_tag',
        'fail',
        'The matching remote tag could not be confirmed. Check origin access and push the release tag.'
      );
    }
    try {
      const runs = JSON.parse(
        run('gh', [
          'run',
          'list',
          '--repo',
          metadata.repository,
          '--workflow',
          'build-release.yml',
          '--commit',
          commit,
          '--limit',
          '10',
          '--json',
          'databaseId,headSha,headBranch,event,status,conclusion,url',
        ])
      );
      const current =
        Array.isArray(runs) &&
        runs.find(
          (item) =>
            item.headSha === commit &&
            item.headBranch === metadata.tag &&
            ['push', 'workflow_dispatch'].includes(item.event) &&
            Number.isSafeInteger(item.databaseId) &&
            item.databaseId > 0
        );
      if (!current) {
        add(
          'signing',
          'not_checked',
          'No matching tagged release workflow was found. Signing configuration is unverified.'
        );
        add('publication', 'not_checked', 'No matching installer publication was found.');
      } else {
        const details = JSON.parse(
          run('gh', [
            'run',
            'view',
            String(current.databaseId),
            '--repo',
            metadata.repository,
            '--json',
            'jobs,status,conclusion',
          ])
        );
        const jobs = Array.isArray(details.jobs) ? details.jobs : [];
        const signing = jobs
          .find((job) => job.name === 'test')
          ?.steps?.find((step) => step.name === 'Check required signing settings');
        add(
          'signing',
          signing?.conclusion === 'success'
            ? 'pass'
            : signing?.conclusion === 'failure'
              ? 'fail'
              : 'not_checked',
          signing?.conclusion === 'failure'
            ? `Configure the required signing settings in GitHub Actions: ${SIGNING_SECRET_NAMES.join(', ')}. This diagnostic does not read secret values.`
            : 'The tagged workflow must confirm signing settings; certificate validity and platform signatures are verified by later build gates.'
        );
        published =
          details.status === 'completed' &&
          details.conclusion === 'success' &&
          ['build-macos', 'build-windows', 'build-linux', 'release'].every((name) =>
            jobs.some((job) => job.name === name && job.conclusion === 'success')
          );
        add(
          'publication',
          published ? 'pass' : details.status === 'completed' ? 'fail' : 'not_checked',
          published
            ? 'The matching tagged workflow completed platform build gates and installer publication.'
            : 'Installer publication has not passed all platform and release gates.'
        );
        // Build the URL from a validated numeric handle; never echo arbitrary CLI error bodies.
        workflow = {
          id: current.databaseId,
          url: `https://github.com/${metadata.repository}/actions/runs/${current.databaseId}`,
          status: details.status,
          conclusion: details.conclusion,
        };
      }
    } catch {
      add(
        'signing',
        'not_checked',
        'GitHub release evidence could not be read. Check gh access; signing configuration remains unverified.'
      );
      add('publication', 'not_checked', 'Installer publication evidence could not be read.');
    }
  } else {
    add('remote_tag', 'not_checked', 'Use --github to check the pushed tag.');
    add(
      'signing',
      'not_checked',
      'Use --github to inspect signing evidence from the exact tagged workflow.'
    );
    add('publication', 'not_checked', 'Use --github to inspect installer publication.');
  }
  const required = ['versions', 'notes', 'clean_source', 'local_tag', 'remote_tag', 'signing'];
  const ready = required.every((key) =>
    checks.some((check) => check.key === key && check.status === 'pass')
  );
  return {
    schema_version: 1,
    ...metadata,
    commit,
    checks,
    ready_to_request_publication: ready,
    installer_publication_verified: ready && published,
    workflow,
    qualification:
      'Read-only source and recorded CI evidence. This does not establish a live agent task, NSR acceptance, Temporal execution or actual updater installation. See docs/RELEASE_VERIFICATION.md.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help'))
    console.log(
      'Usage: npm run doctor:release -- [--json] [--github]\nRead-only source checks; --github additionally reads the pushed tag and matching release workflow.'
    );
  else if (args.some((arg) => !['--json', '--github'].includes(arg))) {
    console.error('Usage: npm run doctor:release -- [--json] [--github]');
    process.exitCode = 2;
  } else {
    const report = releaseReadiness({ github: args.includes('--github') });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Release readiness: ${report.tag ?? 'invalid metadata'}`);
      for (const check of report.checks)
        console.log(`${check.status.toUpperCase()} ${check.key}: ${check.message}`);
      if (report.workflow) console.log(report.workflow.url);
      console.log(report.qualification);
    }
    if (!report.ready_to_request_publication) process.exitCode = 1;
  }
}
