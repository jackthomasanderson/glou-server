-- Drop the old check constraint
ALTER TABLE cellars DROP CONSTRAINT IF EXISTS cellars_cellar_type_check;

-- Add new check constraint with updated values
ALTER TABLE cellars ADD CONSTRAINT cellars_cellar_type_check 
CHECK (cellar_type IN ('aging', 'service', 'multizone', 'combined', 'hybrid', 'cigar', 'natural', 'other'));
