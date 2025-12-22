# 🔐 Security & Encryption - Glou Server

This document outlines the security measures and encryption procedures implemented in Glou Server, in accordance with ANSSI recommendations.

## 🛡️ Security Architecture

Glou Server uses an **AES-256-GCM** encryption system to protect all sensitive data at rest.

Additionally, cookie-based authentication is protected by a signed session token (HMAC-SHA256) with expiration and a CSRF token for mutating requests.

### Technical Specifications
- **Algorithm**: AES-256-GCM (Confidentiality + Authenticity)
- **Key Size**: 256 bits
- **Derivation**: PBKDF2 with 100,000 iterations (SHA-256)
- **Nonce**: Unique random (96 bits) per operation
 - **Sessions**: HMAC-SHA256 signed token in `glou_session` cookie
 - **CSRF**: Random token in `glou_csrf` cookie; clients must send `X-CSRF-Token` header matching the cookie on POST/PUT/DELETE

## ⚙️ Configuration (Production)

To enable encryption in production, configure the following environment variables:

```bash
# Generate a passphrase (min 32 chars)
ENCRYPTION_PASSPHRASE=$(openssl rand -base64 48)
# Generate a unique salt
ENCRYPTION_SALT=$(openssl rand -hex 16)
ENVIRONMENT=production
# Generate session secret (min 32 chars)
SESSION_SECRET=$(openssl rand -base64 48)
# Trust proxy headers when behind a reverse proxy
TRUST_PROXY_HEADERS=true
```

## 📋 Deployment Checklist

### 1. Files & Permissions
- [ ] `.env` set to `chmod 600`
- [ ] `glou.db` set to `chmod 600`
- [ ] Execution under a dedicated user (non-root)

### 2. Network
- [ ] HTTPS enabled via reverse proxy (Nginx/Caddy)
- [ ] `PUBLIC_PROTOCOL=https` and `PUBLIC_DOMAIN` configured
- [ ] CORS limited to authorized domains
 - [ ] `TRUST_PROXY_HEADERS=true` only if reverse proxy is trusted

### 3. Passwords
- [ ] Strong admin password (≥ 12 characters)
- [ ] SMTP/API credentials stored via the encryption system

## 🛠️ Usage (Developers)
### CSRF in clients
On login, the server sets a `glou_csrf` cookie. Send this value in the `X-CSRF-Token` header for any POST/PUT/DELETE request:

```js
const csrf = document.cookie.split('; ').find(c => c.startsWith('glou_csrf='))?.split('=')[1];
await fetch('/wines', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
	body: JSON.stringify({ name: '...', region: '...', vintage: 2020, type: 'Red' })
});
```

### Store Encrypted Data
```go
err := store.StoreEncryptedCredential(ctx, "service_name", "type", "secret_value")
```

### Retrieve Decrypted Data
```go
value, err := store.GetDecryptedCredential(ctx, "service_name")
```

## 🔄 Updates & Migration
The encryption system was introduced in v1.0.0. For existing installations, SMTP credentials and API tokens must be re-registered via the interface or setup wizard to be encrypted.
Session signing with `SESSION_SECRET` and CSRF enforcement were introduced in v1.1.0.
