-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2FA Settings table
CREATE TABLE IF NOT EXISTS two_fa_settings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL DEFAULT 'none', -- 'none', 'totp', 'webauthn'
  totp_secret VARCHAR(255),
  webauthn_credentials JSONB,
  recovery_codes_hash JSONB,
  enabled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255),
  ip_address VARCHAR(45),
  is_trusted BOOLEAN DEFAULT FALSE,
  last_activity_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- WebAuthn credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id VARCHAR(255) UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Security events table for audit logging
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Failed login attempts tracking (for brute force protection)
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id UUID PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);
CREATE INDEX idx_failed_login_attempts_expires_at ON failed_login_attempts(expires_at);
CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
