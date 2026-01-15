ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_theme_mode_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_mode_check CHECK (theme_mode IN ('dark', 'light', 'auto'));
