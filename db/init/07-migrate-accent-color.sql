-- Migrate existing users with legacy/gold accent colors to the new blue accent
BEGIN;

UPDATE users
SET accent_color = '#2563EB'
WHERE LOWER(accent_color) IN ('#c5a059', '#c9a961', '#b89551')
   OR accent_color IS NULL;

COMMIT;
