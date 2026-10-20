# StateSet Desktop v1.1.24

Sandbox chats now use a restricted native API transport so hosted browser preflight rules cannot block computer access. Requests stay on the configured Sandbox and NSR endpoints, use the current saved credentials, reject redirects and unsupported routes, and support owned cancellation and deadlines in development and packaged apps.

- Clarify computer and policy-key setup, organization/brand scope, saved-versus-live status and keyring lifetime. Confirm credential writes, serialize vault changes, preserve failed entries and report partial saves accurately.
- Keep drafts editable during setup and agent work, save model and NSR preferences per chat, and show live activity consistently in the conversation, library and command search.
- Preserve unfinished tasks across restart without replaying actions. Pause at operation boundaries, retain late computer identities and receipts, and provide explicit, identity-bound action recovery controls.
- Check workspace files against explicit text or SHA-256 criteria using collected bytes and NSR Decisions proofs. Require matching goals and receipts; never treat model descriptions as verification.
- Retain every observed computer identity until cleanup is confirmed, preserve current credentials after stale failures, and distinguish provider authentication failures from Sandbox authentication failures.
- Close test-owned Electron processes and remove their temporary profiles after each native case while retaining suite-owned windows. Seed recovery fixtures through the serialized chat store and capture failures before teardown.

A real desktop test provisioned and started an owned Sandbox computer and independently confirmed its eventual cleanup. The inference endpoint then reported insufficient Anthropic credits; no model result or command execution was accepted. The desktop shell used a fixture tenant/brand, so this does not establish live platform login, NSR policy acceptance or Temporal execution. Those integrations require separate approved live configuration.

Agent work in Sandbox API chats runs while the desktop is open. Signed installer publication remains subject to the existing Apple/Windows signing and platform verification gates.

Local verification passed 3,464 unit tests, types, strict lint, release fixtures and production builds. The native regression was stopped at the user’s request after 86 passing cases and one settings-audit timeout. Remaining native cases and the timeout were not rerun.
