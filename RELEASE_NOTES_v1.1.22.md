# StateSet Desktop v1.1.22

This patch makes desktop agents and settings more predictable, with clearer controls in both themes.

- Saved engine connections support native workflow requests and event streams with HTTPS, credential, workspace and cancellation guards.
- Settings distinguish pending saves from confirmed values and retain clear Retry feedback across navigation. Turning sharing off immediately stops local telemetry, even when saving fails.
- Automatic agent recovery waits for confirmed settings and owned session data. Workspace, authentication and preference changes cancel obsolete continuations; query refreshes do not duplicate submitted starts.
- Restart snapshots survive loading and preserve other workspaces. Background counts, notifications and bulk lists follow the selected brand.
- Custom agents and workflow blueprints retain saved profiles and editable drafts through failures. Oversized instructions remain editable until they fit engine limits.
- Light and dark themes use clear toggle states, associated descriptions, visible keyboard focus and larger targets. Notifications remain readable above dialogs.

Native regression coverage includes preference persistence, restart recovery, controlled engine responses and real temporary-profile permission failures. Release build and publication outcomes are recorded separately from these notes.

Published installers require Windows signing and macOS signing/notarization. Live engine, sandbox, Temporal and NSR acceptance still require the designated configuration described in the [computer-chat guide](docs/COMPUTER_CHATS.md).
