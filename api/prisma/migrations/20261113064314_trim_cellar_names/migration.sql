-- #869: cellar names are now trimmed by the API. Names saved before keep
-- their outer spaces until trimmed here, once. The class below is what
-- JavaScript's trim() strips (white space and line terminators, the
-- no-break space U+00A0 and the other Unicode spaces included), so a stored
-- name ends up as the API would store it. A name made only of spaces is
-- left as it is (an empty name would be worse); the edit form refuses it,
-- so it gets a real name on its next save.
UPDATE "cellars"
SET "name" = regexp_replace(
  "name",
  '^[\s   -     　﻿]+|[\s   -     　﻿]+$',
  '',
  'g'
)
WHERE "name" ~ '^[\s   -     　﻿]|[\s   -     　﻿]$'
  AND "name" !~ '^[\s   -     　﻿]*$';
