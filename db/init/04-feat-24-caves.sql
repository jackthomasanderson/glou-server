-- FEAT-24: Caves (Cellars/Wine Storage) management

-- Create caves table
CREATE TABLE IF NOT EXISTS caves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cave_type VARCHAR(50) NOT NULL,
  location_description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT caves_cave_type_check CHECK (cave_type IN ('cellar', 'showcase', 'climate_cabinet', 'rack', 'other'))
);

-- Create index on user_id for efficient querying of user caves
CREATE INDEX IF NOT EXISTS idx_caves_user_id ON caves(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_caves_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_caves_timestamp ON caves;
CREATE TRIGGER trigger_caves_timestamp
  BEFORE UPDATE ON caves
  FOR EACH ROW
  EXECUTE FUNCTION update_caves_timestamp();

-- Add cave_id foreign key to bottles table (soft migration, optional column)
ALTER TABLE bottles
  ADD COLUMN IF NOT EXISTS cave_id UUID REFERENCES caves(id) ON DELETE SET NULL;

-- Create index on cave_id for efficient querying of bottles by cave
CREATE INDEX IF NOT EXISTS idx_bottles_cave_id ON bottles(cave_id);
