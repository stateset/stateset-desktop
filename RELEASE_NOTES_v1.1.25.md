# StateSet Desktop v1.1.25

Sandbox chats now give specific recovery guidance for provider credits, model access, policy credentials and proof failures. Technical details stay collapsed, saved errors are bounded and credentials are redacted. Session identifiers and file-proof metadata use compact disclosures.

- Check a saved Sandbox connection on demand through the read-only capabilities endpoint. Discard stale replies after connection or workspace changes, retain rejected credentials, and distinguish declared capabilities from actual execution readiness.
- Validate file paths, digests and comparison limits before collecting evidence. Keep invalid entries editable, prevent duplicate submissions, preserve failed entries for explicit retry, and label historical file receipts clearly.
- Preserve NSR transport and proof error provenance without exposing backend payloads or automatically replaying decisions. Missing policy credentials lead directly to connection settings.
- Add `npm run doctor:release -- --json` for local readiness and `--github` for read-only source, signing-gate and publication evidence.

Verification includes 232 focused tests for the latest recovery changes, renderer and native-test types, strict lint, formatting and production builds. Earlier focused connection/readiness checks and release fixtures also passed. Playwright remains stopped at the user's request; the native layout changes have not been rerun.

The earlier real Sandbox test verified computer provisioning and cleanup, but provider credits blocked inference. Live NSR Decisions acceptance and Temporal execution remain unverified. Direct Sandbox chats run while the desktop is open. Signed installers remain subject to the existing signing and platform gates.
