-- FEAT-24 rename caves -> cellars
BEGIN;

-- Rename main table
ALTER TABLE IF EXISTS caves RENAME TO cellars;

-- Rename columns and constraint on type
ALTER TABLE IF EXISTS cellars RENAME COLUMN cave_type TO cellar_type;
ALTER TABLE IF EXISTS cellars RENAME CONSTRAINT caves_cave_type_check TO cellars_cellar_type_check;

-- Rename trigger function and trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_caves_timestamp') THEN
    ALTER FUNCTION update_caves_timestamp() RENAME TO update_cellars_timestamp;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_caves_timestamp') THEN
    ALTER TRIGGER trigger_caves_timestamp ON cellars RENAME TO trigger_cellars_timestamp;
  END IF;
END
$$;

-- Rename index
ALTER INDEX IF EXISTS idx_caves_user_id RENAME TO idx_cellars_user_id;

-- Bottles FK column rename (guard if bottles not deployed yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bottles' AND column_name = 'cave_id'
  ) THEN
    ALTER TABLE bottles RENAME COLUMN cave_id TO cellar_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bottles_cave_id_fkey'
  ) THEN
    ALTER TABLE bottles RENAME CONSTRAINT bottles_cave_id_fkey TO bottles_cellar_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bottles_cave_id'
  ) THEN
    ALTER INDEX idx_bottles_cave_id RENAME TO idx_bottles_cellar_id;
  END IF;
END
$$;

COMMIT;
