# StateSet Desktop v1.1.23

Each new chat now gets its own computer through the Sandbox API, created in the background.

- Save a Sandbox API key in Chats → Settings, then start a chat. The default runtime no longer requires a workflow engine connection or durable sandbox storage.
- Keep a dedicated session and computer identity per chat. Stable create idempotency keys and saved startup intent prevent duplicate setup after timeouts or restart.
- Reopen saved chats with their transcript and draft, without replaying actions or allocating replacement computers. Setup errors remain visible and recoverable.
- Confirm sandbox shutdown before marking cleanup complete. Unconfirmed shutdown blocks further actions and remains available for inspection and retry.
- Keep NSR action and output checks on by default; configure its key separately. Durable workflows remain an explicit option with their existing readiness and recovery checks.
- Preserve readable light and dark themes, protected key storage, redirect rejection and native support for provisioning idempotency headers.

Sandbox API sessions use the computer-use template, 2 CPUs, 4 GiB, gVisor and a one-hour session budget. Agent work runs while the desktop is open. Engine-owned durable chats retain their server-side execution behavior.

Hosted allocation, isolated workspace execution and eventual cleanup were verified with two owned sandbox computers. That test does not prove provider inference, Temporal workflow execution or NSR acceptance. Verification reports and signed installer publication are tracked separately. Published installers still require configured Apple and Windows signing secrets.
