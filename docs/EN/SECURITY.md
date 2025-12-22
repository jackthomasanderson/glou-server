# 🔐 Security & Encryption - Glou Server

This document outlines the security measures and encryption procedures implemented in Glou Server, in accordance with ANSSI recommendations.

## 🛡️ Security Architecture

Glou Server uses an **AES-256-GCM** encryption system to protect all sensitive data at rest.

### Technical Specifications
- **Algorithm**: AES-256-GCM (Confidentiality + Authenticity)
- **Key Size**: 256 bits
- **Derivation**: PBKDF2 with 100,000 iterations (SHA-256)
- **Nonce**: Unique random (96 bits) per operation

## ⚙️ Configuration (Production)

To enable encryption in production, configure the following environment variables:

```bash
# Generate a passphrase (min 32 chars)
ENCRYPTION_PASSPHRASE=$(openssl rand -base64 48)
# Generate a unique salt
ENCRYPTION_SALT=$(openssl rand -hex 16)
ENVIRONMENT=production
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

### 3. Passwords
- [ ] Strong admin password (≥ 12 characters)
- [ ] SMTP/API credentials stored via the encryption system

## 🛠️ Usage (Developers)

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
