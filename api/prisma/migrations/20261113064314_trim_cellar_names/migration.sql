-- #869: cellar names are now trimmed by the API. Names saved before keep
-- their outer spaces until trimmed here, once. A name made only of spaces is
-- left as it is (an empty name would be worse); the edit form refuses it, so
-- it gets a real name on its next save.
UPDATE "cellars"
SET "name" = regexp_replace("name", '^\s+|\s+$', '', 'g')
WHERE "name" ~ '^\s|\s$'
  AND "name" !~ '^\s*$';
