-- #587: the stock-count "add to stock" dialog asks a spirit's ABV (optional).
-- Kept on the find until the count is closed; null = unknown.
ALTER TABLE "inventory_count_entries" ADD COLUMN "newItemAlcoholDegree" DOUBLE PRECISION;
