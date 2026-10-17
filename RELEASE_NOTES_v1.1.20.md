# StateSet Desktop v1.1.20

This patch improves everyday navigation, conversation readability, and recovery
when background work or connection changes arrive while you are using the app.

- Command search retains the selected conversation or agent as results update.
  Long names stay inside the palette, status descriptions are available to
  assistive technology, and scrolling respects reduced motion.
- Conversation menus, confirmation dialogs, desktop previews, and dashboard
  controls use consistent theme surfaces and keyboard behavior.
- Workspace navigation preserves address edits and keyboard focus. Paths,
  multilingual context, and chat requests follow engine byte limits, with
  editable drafts and clear validation feedback.
- Fleet actions retain progress across navigation and retry failed agents.
  Pending default saves preserve newer edits and show errors without losing work.
- Async chat actions remain bound to their original workspace and connection.
  Streaming transcripts preserve reading positions and show new-message counts.
- The app uses the supported Electron 42 runtime and updated dependencies.
  Packaged macOS applications require macOS 12 or newer.

Desktop regression coverage includes native light/dark theme checks, keyboard
navigation, accessibility, bundle startup/restart, and Linux installer checks.
Their actual results are recorded separately; these notes do not establish a
successful release build.

Published installers require Windows signing and macOS signing/notarization.
A deployed engine, Temporal worker, sandbox, and NSR still need the designated
live computer-chat acceptance workspace described in
[the computer-chat guide](docs/COMPUTER_CHATS.md). Controlled desktop tests do not
establish live backend readiness.
