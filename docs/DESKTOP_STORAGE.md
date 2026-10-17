# Local data and bundle verification

StateSet generates a random 256-bit configuration key on first launch, in both
development and packaged apps. The key lives in `userData/.store-key`, with
owner-only permissions on Unix. It is written and flushed privately before an
atomic installation that cannot overwrite another launch's key. The encrypted
configuration is `userData/stateset-config.json`.

Configuration encryption protects against accidental disclosure; the key file
must be kept private alongside the profile. API credentials still use Electron
`safeStorage`. When the OS keyring is unavailable, credentials stay in memory for
the app session, as explained in connection settings.

Keep `.store-key` with configuration backups. Existing development keys are
retained. Administrators can continue to provide an optional
`STORE_ENCRYPTION_KEY` of at least 32 characters; retain its exact original value.
Removing that variable from a profile encrypted with a managed key requires
restoring it. Never delete a key to resolve an error: missing keys for encrypted
profiles, incomplete keys and filesystem errors stop startup without clearing
saved configuration or silently rotating the key.

Legacy plaintext JSON settings are retained and rewritten through encrypted,
atomic configuration storage on startup. Configuration writes use owner-only
permissions. Release bundles include the runtime and built renderer, excluding
Electron unit test files and `dist/verification` artifacts.

## Scheduled workflow recovery

Schedules are managed by the open desktop application. Before sending a scheduled
start request, the app saves the occurrence's request ID, original engine URL,
workflow ID and frozen input in encrypted configuration. It advances the schedule
only after the engine confirms the launch and the desktop saves its tracking record.
Connection changes, pauses and edits made during a pending save prevent a new launch.

If the response is lost or the app closes during submission, the occurrence stays
unconfirmed. **Check pending run** asks the original engine for that workflow's
status, including runs that have already completed. It never sends another start
request. Reconnect to the displayed original engine before checking. A missing,
unavailable or invalid status response keeps the occurrence pending; it does not
prove that no work was admitted. A request that does not respond within 45 seconds
also remains pending for confirmation.

You can pause a schedule while confirming an admitted run. Deletion and **Run now**
remain unavailable until a submitted occurrence is confirmed, preserving the
identity needed for recovery. A known unsent occurrence can be retried or edited.
Malformed saved pending records stop workflow settings from loading so they cannot
be silently discarded by a later save. Keep the original profile and restore a
valid backup if retrying cannot recover its records.

## Custom background agents

Custom agent saves and removals share a write queue. Each operation uses the
latest acknowledged collection, and submitted profiles are copied before they
wait. Missing desktop storage, rejected writes and false acknowledgements leave
the previous profiles available for retry.

The agent editor keeps its fields and actions stable while a save or removal is
pending. Failed creation retains the draft; failed removal retains the saved
profile. Removing a profile leaves an unrelated new-agent draft intact. Existing
workflows keep their agent snapshots and are unaffected by profile removal.
Saved-agent status and mutations remain unavailable until settings load.
Save and removal errors appear above the open editor so their feedback stays
readable and dismissible while the draft remains available for retry.

New profiles and workflow launch requests validate engine-bound model, connector
key and instruction limits using UTF-8 bytes. The editor keeps oversized
instructions editable with a byte count and field error. It does not truncate the
draft. Existing saved profiles, blueprints and schedules remain available even
when an older agent definition exceeds current engine limits; a new launch asks
for a corrected definition before sending work. A submitted scheduled occurrence
can still be recovered by its original workflow identity.

## Workflow blueprints

Blueprint saves, removals and imports share one write queue. Each operation merges
against the latest acknowledged collection and publishes its result only after
desktop storage accepts the write. Rejected writes and false acknowledgements
leave the previous collection available for retry. Queued inputs are copied so a
later form edit cannot alter the definition being saved.

An imported bundle is validated in full and saved in one write, preserving the
bundle's order and unrelated saved blueprints. A failed import does not add a
partial collection. Importing a bundle again after a successful import intentionally
creates new copies. While a blueprint change is pending, its editor keeps the
selection and name stable and prevents duplicate submission or closing the form;
newer goal and command edits remain available. Deleting a saved blueprint keeps
the current workflow draft.

## Linux bundle smoke test

On the shared workstation, route each build and test below through Agent Builds.
Node 22.12+ is required.

```bash
npm run build:electron
npm run build:vite
./node_modules/.bin/electron-builder --dir --linux --publish never --config.directories.output=dist/packaged-smoke
STATESET_PACKAGED_EXECUTABLE=dist/packaged-smoke/linux-unpacked/stateset-desktop npm run test:e2e:bundle
```

The bundle project has no Vite web server. It launches the actual Linux executable
with temporary XDG configuration, cache and data directories, verifies the
production file renderer, private key creation, encrypted preferences and restart
persistence, and checks the ASAR inventory. It closes its own processes and removes
only its temporary profiles. App test hooks stay disabled; the test connects to
the production renderer after its initial navigation and closes the native window
through the normal IPC bridge. A startup screenshot is saved to
`dist/verification/linux-bundle-startup.png`. Electron documents Linux application data isolation
through [`XDG_CONFIG_HOME`](https://www.electronjs.org/docs/latest/api/app#appgetpathname).

The ordinary Electron project also tests the packaged startup branch with an
isolated bootstrap, including legacy plaintext migration. Neither test uses live
service credentials or verifies installer signing, OS integration, or backend
service execution.
