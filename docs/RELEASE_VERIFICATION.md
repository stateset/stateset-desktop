# Release verification

A successful build is only one release gate. Publishable releases require the
unit, lint, type, and desktop checks, three platform builds, signing evidence,
and valid updater manifests. The build workflow does not publish on pull requests.

## Runtime requirements

Electron 42 requires Node.js 22.12+ for development and macOS 12+ for packaged
applications. `npm run build:electron` installs the pinned Electron binary before
compilation because Electron no longer downloads it in its package postinstall.
For direct Playwright commands after `npm ci`, run `npm run setup:electron` first.
An unsigned macOS review build cannot demonstrate native notification delivery;
Electron 42 requires signing for that API. See the upstream
[migration notes](https://www.electronjs.org/docs/latest/breaking-changes#breaking-api-changes-420).

## Before publishing

- The version tag must equal `package.json`'s version.
- Tagged and manually published releases require Windows signing credentials and
  macOS signing plus notarization credentials. Pull requests can build unsigned
  artifacts for review.
- Signed builds enable `forceCodeSigning` so a missing identity cannot silently
  produce an unsigned release.
- The workflow validates Windows installer signatures, macOS application
  signatures and stapled notarization tickets, and packaged Linux startup and
  restart before uploading release artifacts. The Linux build also validates updater
  hashes and starts the applications extracted from its AppImage and Debian
  packages using isolated profiles, without installing them on the host.
- A live computer-chat deployment must separately pass the workflow documented
  in [COMPUTER_CHATS.md](COMPUTER_CHATS.md). Mock desktop tests do not establish
  sandbox, Temporal worker, NSR, or deployed policy readiness.

The live test requires the `CHAT_TEST_*` endpoints, test identity, and credentials
in the protected `computer-chat-test` environment. Do not put secrets in release
assets or evidence reports.

## Updater integrity

`node scripts/collect-release-assets.mjs artifacts release-assets VERSION`
collects only `macos-builds`, `windows-builds`, and `linux-builds`. It preserves
builder-generated filenames because updater manifests and differential-download
blockmaps refer to those names. Prefixing installers with artifact-directory
names breaks those references.

The collector validates all manifests before creating its output directory. It
rejects missing installers, duplicate filenames, symlinks, unsafe file references,
version mismatches, wrong sizes, and SHA-512 mismatches. It requires installers
and updater metadata from all three platforms. Output also includes `SHA256SUMS`
for manual download verification.

Use a new output directory for each collection; existing output is rejected to
prevent stale release assets from being published. Keep the original downloaded
artifacts if collection fails, fix the build inputs, then collect again.

## Local checks

On the shared workstation, route these through Agent Builds:

```sh
/home/dom/agent-builds/agent-builds run --lane quick -- npm run test:release-assets
/home/dom/agent-builds/agent-builds run -- npm run test:e2e
/home/dom/agent-builds/agent-builds run -- npm run build:linux -- --publish never
/home/dom/agent-builds/agent-builds run -- env STATESET_PACKAGED_EXECUTABLE=release/linux-unpacked/stateset-desktop npm run test:e2e:bundle
/home/dom/agent-builds/agent-builds run -- env STATESET_LINUX_ARTIFACTS_DIR=release npm run test:e2e:distribution
```

The bundle test uses an isolated profile, loads the production renderer, confirms
that test hooks are disabled, and checks encrypted settings and key stability
across restart. It currently runs on Linux. Signed installers, actual updater
installation, and native startup on macOS and Windows still require platform
verification; adding CI steps is not evidence that they have already passed.
