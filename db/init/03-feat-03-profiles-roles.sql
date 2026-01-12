
-- Ajout clé API IA utilisateur (OpenAI ou autre)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT;

-- Add basic role + profile columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(2),
  ADD COLUMN IF NOT EXISTS date_time_format VARCHAR(20) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS temperature_unit VARCHAR(2) NOT NULL DEFAULT 'c',
  ADD COLUMN IF NOT EXISTS theme_mode VARCHAR(10) NOT NULL DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Keep roles simple for private usage
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_preferred_locale_check;
ALTER TABLE users
  ADD CONSTRAINT users_preferred_locale_check CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'fr'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_temperature_unit_check;
ALTER TABLE users
  ADD CONSTRAINT users_temperature_unit_check CHECK (temperature_unit IN ('c', 'f'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_theme_mode_check;
ALTER TABLE users
  ADD CONSTRAINT users_theme_mode_check CHECK (theme_mode IN ('dark', 'light'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_date_time_format_check;
ALTER TABLE users
  ADD CONSTRAINT users_date_time_format_check CHECK (date_time_format IN ('system', '24h', '12h'));

-- App-wide personal branding (single row)

CREATE TABLE IF NOT EXISTS app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  app_name TEXT,
  app_tagline TEXT,
  logo_url TEXT,
  ai_api_key TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (id, app_name, app_tagline, logo_url)
VALUES (TRUE, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
