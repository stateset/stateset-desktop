# StateSet Desktop v1.1.21

This patch strengthens workflow recovery, saved blueprints, and update feedback,
with clearer controls in smaller windows and both themes.

- Scheduled workflows retain their original occurrence through uncertain launch
  responses and app restarts. Status checks recover the original workflow while
  preserving pause and edit intent and preventing duplicate launch actions.
- Blueprint imports save complete bundles in one write. Concurrent saves retain
  acknowledged changes, failed writes leave saved blueprints available for retry,
  and deleting a blueprint preserves the working draft.
- Workflow headers keep complete action labels at standard and minimum window
  sizes. Saved multi-step commands retain their accessible field label.
- Temporary workflow settings and credential read failures offer Retry without
  overwriting saved workflows, newer connection settings, or typed drafts.
- Update checks distinguish unchecked from current, preserve download and restart
  actions across late replies, and offer retry feedback after failed requests.
- Patched routing and development tooling reduce dependency findings while
  retaining strict lint rules. Installer publication is bound to the exact
  pushed version tag and uses required signing and notarization checks.

Regression coverage includes native restart recovery, light and dark themes,
scoped accessibility scans, and Linux bundle and installer checks. Release build
and publication results are recorded separately from these notes.

Published installers require Windows signing and macOS signing/notarization.
Live engine, sandbox, Temporal worker, and NSR acceptance still require the
designated workspace described in the
[computer-chat guide](docs/COMPUTER_CHATS.md).
