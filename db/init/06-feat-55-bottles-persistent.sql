-- FEAT-55: Persistent Bottle Storage
-- Comprehensive bottles table with all attributes from FEAT-01
BEGIN;

CREATE TABLE IF NOT EXISTS bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cellar_id UUID NOT NULL,
  
  -- Intrinsic data
  category VARCHAR(20) NOT NULL CHECK (category IN ('wine', 'sparkling', 'spirit', 'cigar')),
  label VARCHAR(120) NOT NULL,
  
  -- Category-specific essential fields
  producer_name VARCHAR(120), -- wine
  house_name VARCHAR(120), -- sparkling
  distillery_name VARCHAR(120), -- spirit
  brand_name VARCHAR(120), -- cigar
  
  name_edition VARCHAR(160) NOT NULL,
  vintage_or_none VARCHAR(10) NOT NULL DEFAULT 'NV', -- 'NV' or YYYY format
  
  abv NUMERIC(4,1), -- alcohol by volume (spirit: required 20-80, wine: 5-18)
  
  -- Physical state
  is_opened BOOLEAN NOT NULL DEFAULT false,
  fill_level VARCHAR(20) CHECK (fill_level IN ('full', 'threeQuarters', 'half', 'low', 'empty')),
  
  -- Wine-specific
  color VARCHAR(40),
  appellation VARCHAR(120),
  grapes VARCHAR(160),
  format VARCHAR(40),
  serving_temp VARCHAR(40),
  wine_lot_number VARCHAR(60),
  carafing VARCHAR(80),
  requires_aeration BOOLEAN,
  
  -- Sparkling-specific
  style VARCHAR(60),
  dosage VARCHAR(60),
  disgorgement VARCHAR(60),
  pressure VARCHAR(60),
  base_wine VARCHAR(120),
  bottling_date VARCHAR(60),
  base_year INTEGER,
  
  -- Spirit-specific
  age_statement VARCHAR(40),
  cask_type VARCHAR(120),
  batch VARCHAR(60),
  additive_note VARCHAR(160),
  angel_share VARCHAR(120),
  aroma_profile VARCHAR(200),
  
  -- Cigar-specific
  format_box VARCHAR(40),
  cigar_format VARCHAR(40),
  quantity_in_box INTEGER,
  manufacture_year INTEGER,
  seal_state VARCHAR(30),
  leaf_origin VARCHAR(120),
  factory_code VARCHAR(60),
  target_humidity NUMERIC(3,1),
  humidification_system VARCHAR(120),
  
  -- Transverse attributes
  location VARCHAR(80),
  collection VARCHAR(80),
  photo_url TEXT,
  estimated_value NUMERIC(12,2),
  peak_maturity_from INTEGER,
  peak_maturity_to INTEGER,
  alert_status VARCHAR(20) DEFAULT 'none' CHECK (alert_status IN ('none', 'approaching', 'critical')),
  tasting_note VARCHAR(240),
  purchase_place VARCHAR(160),
  purchase_price NUMERIC(10,2),
  
  -- User customization
  tags VARCHAR(40)[] DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Foreign keys
  CONSTRAINT fk_bottles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bottles_cellar FOREIGN KEY (cellar_id) REFERENCES cellars(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bottles_user_id ON bottles(user_id);
CREATE INDEX IF NOT EXISTS idx_bottles_cellar_id ON bottles(cellar_id);
CREATE INDEX IF NOT EXISTS idx_bottles_category ON bottles(category);
CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(is_opened);
CREATE INDEX IF NOT EXISTS idx_bottles_deleted_at ON bottles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bottles_user_not_deleted ON bottles(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bottles_cellar_not_deleted ON bottles(cellar_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bottles_alert ON bottles(alert_status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bottles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER trigger_bottles_timestamp
BEFORE UPDATE ON bottles
FOR EACH ROW
EXECUTE FUNCTION update_bottles_timestamp();

COMMIT;
