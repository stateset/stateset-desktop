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
