# Authentication API

API endpoints used by the desktop app for authentication.

## Base URL

```
https://engine.stateset.cloud.stateset.app
```

Configurable via `VITE_API_URL` environment variable.

---

## POST /api/v1/auth/register

Create a new user account.

### Request

```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "SecurePass123",
  "company": "Acme Inc."
}
```

### Response (201 Created)

```json
{
  "ok": true,
  "user": {
    "id": "usr_abc123",
    "email": "john@company.com",
    "name": "John Doe"
  },
  "tenant": {
    "id": "tnt_xyz789",
    "name": "Acme Inc.",
    "slug": "acme-inc-abc123",
    "tier": "free"
  },
  "brands": [
    {
      "id": "brd_def456",
      "name": "Default Brand",
      "slug": "default-brand",
      "tenant_id": "tnt_xyz789",
      "enabled": true
    }
  ],
  "credentials": {
    "engine_api_key": "sk-...",
    "sandbox_api_key": "sk_test_..."
  }
}
```

### Error Response (400/409)

```json
{
  "ok": false,
  "error": "Email already registered"
}
```

---

## POST /api/v1/auth/login

Authenticate with email and password.

### Request

```json
{
  "email": "john@company.com",
  "password": "SecurePass123"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "user": {
    "id": "usr_abc123",
    "email": "john@company.com",
    "name": "John Doe"
  },
  "tenant": {
    "id": "tnt_xyz789",
    "name": "Acme Inc.",
    "slug": "acme-inc-abc123",
    "tier": "free"
  },
  "brands": [
    {
      "id": "brd_def456",
      "name": "Default Brand",
      "slug": "default-brand",
      "tenant_id": "tnt_xyz789",
      "enabled": true
    }
  ],
  "credentials": {
    "engine_api_key": "sk-...",
    "sandbox_api_key": "sk_test_..."
  }
}
```

### Error Response (401)

```json
{
  "ok": false,
  "error": "Invalid email or password"
}
```

---

## POST /api/v1/auth/forgot-password

Request a password reset email.

### Request

```json
{
  "email": "john@company.com"
}
```

### Response (200 OK)

```json
{
  "ok": true,
  "message": "Password reset email sent"
}
```

---

## Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
