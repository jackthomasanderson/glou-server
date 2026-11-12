-- #648: the six profile accent colours were replaced by darker shades of the
-- same hues, readable as text and under white text (WCAG AA). Members keep
-- the colour they picked, moved to its new shade. The dark theme uses a light
-- shade of each, chosen in the web app.
UPDATE "User" SET "accentColor" = CASE lower("accentColor")
  WHEN '#6366f1' THEN '#4f46e5'
  WHEN '#f43f5e' THEN '#be123c'
  WHEN '#f59e0b' THEN '#b45309'
  WHEN '#10b981' THEN '#047857'
  WHEN '#06b6d4' THEN '#0e7490'
  WHEN '#8b5cf6' THEN '#7c3aed'
  ELSE "accentColor"
END
WHERE lower("accentColor") IN ('#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6');

ALTER TABLE "User" ALTER COLUMN "accentColor" SET DEFAULT '#4f46e5';
