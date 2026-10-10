-- #173: the "one bottle per grid slot" and "one in-progress stocktake
-- session at a time" rules were only ever checked in application code
-- (read-then-write), leaving a race window where two concurrent requests
-- could both pass the check and both write. Both rules are now also
-- guaranteed by the database via partial unique indexes.
--
-- Not expressible in schema.prisma: Prisma's schema language has no syntax
-- for a partial (WHERE-qualified) unique index, so these two indexes exist
-- only here, in the migration history — see the comments on `InventoryItem`
-- and `InventoryCountSession` in schema.prisma.

-- A grid slot (cellarId, slotColumn, slotRow) can be held by at most one
-- non-deleted bottle. Rows with no slot assigned (slotColumn/slotRow null)
-- or no cellar are naturally excluded: Postgres never treats two NULLs as
-- equal in a unique index.
CREATE UNIQUE INDEX "bottles_cellar_slot_unique"
  ON "bottles" ("cellarId", "slotColumn", "slotRow")
  WHERE "deletedAt" IS NULL;

-- Only one InventoryCountSession may be 'active' or 'paused' instance-wide
-- at a time (see the "Single active session policy" note in
-- inventory-count.service.ts). There is no natural column to scope this on
-- (it's a single global slot), so the index is built on a constant
-- expression: at most one row can satisfy `(true)` under the partial
-- predicate, i.e. at most one non-terminal session can exist.
CREATE UNIQUE INDEX "inventory_count_sessions_single_active_unique"
  ON "inventory_count_sessions" ((true))
  WHERE "status" IN ('active', 'paused');
