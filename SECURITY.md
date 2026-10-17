# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in StateSet Desktop, please report it responsibly.

**Email:** [security@stateset.io](mailto:security@stateset.io)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- Acknowledgment within 48 hours
- Status update within 5 business days
- We will coordinate disclosure timing with you

### Scope

This policy covers the StateSet Desktop application (this repository). For vulnerabilities in the StateSet API or platform, please email the same address.

## Security Best Practices

- Never commit `.env` files or API keys
- Use `safeStorage` encryption for credentials (handled automatically by the app)
- Keep dependencies up to date (`npm audit`)

## Storage Encryption

- **Production**: `STORE_ENCRYPTION_KEY` (32+ characters) is **required** — the app refuses to start packaged builds without it. Set it in the build/runtime environment, never in the repository.
- **Development**: if `STORE_ENCRYPTION_KEY` is unset, the app generates a per-install key at `userData/.store-key` (owner-only permissions) so local config is never plaintext at rest. Setting the env var explicitly is still preferred to match production behavior.
- Secrets (API keys, OAuth tokens) are additionally encrypted with Electron `safeStorage` (Keychain / DPAPI / Secret Service), independent of the store-level encryption.

## Release Integrity

- Release builds (`v*` tags) **must** be code-signed: CI fails the macOS build without `MAC_CERTS`/`MAC_CERTS_PASSWORD` and the Windows build without `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`.
- macOS builds are notarized when `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` secrets are configured (required for release tags).
- The app bundle ships with `asar` packaging enabled and the auto-updater rejects downgrades (`allowDowngrade: false`).
- Unsigned builds are permitted only for pull-request and branch CI artifacts, never for published releases.
