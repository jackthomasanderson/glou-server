-- #848 (FEAT-110, stage 4 of #471): the movement journal of each wine — who
-- added, opened, drank, moved, repriced or corrected bottles, and when. Every
-- write of a number of bottles (cigars) or of their price records its
-- movement in the same transaction (stock-movement.service.ts). Business
-- history: never purged by the audit-log retention (#588).
--
-- The past is not rebuilt (decision #471, point 49): each wine's journal
-- starts with one line "Update: N in the cellar", N its units in stock now,
-- counted by the single rule `itemUnits` (shared/units.ts). The field history
-- from before stays readable in the audit log.
-- No BEGIN/COMMIT (design.md): Prisma runs this file in one implicit transaction.

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('INITIAL', 'ADDED', 'OPENED', 'CONSUMED', 'UNFINISHED', 'PUT_BACK', 'MOVED', 'CORRECTED', 'PRICE_CHANGED', 'TRASHED', 'RESTORED');

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "itemId" TEXT,
    "kind" "StockMovementKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "details" JSONB,
    "userId" TEXT,
    "guestName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_kind_createdAt_idx" ON "stock_movements"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_idx" ON "stock_movements"("itemId");

-- CreateIndex
CREATE INDEX "stock_movements_userId_idx" ON "stock_movements"("userId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "bottles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The first line of every wine's journal: its units in stock now. A unit in
-- the trash holds nothing; finished or written off, 0; an opened bottle 1,
-- an opened box its cigars left; a group `quantity` bottles, or
-- `quantity × cigarsPerBox` cigars for boxes (itemUnits, shared/units.ts).
INSERT INTO "stock_movements" ("productId", "kind", "delta", "count", "createdAt")
SELECT p."id", 'INITIAL', s."units", s."units", CURRENT_TIMESTAMP
FROM "products" AS p
CROSS JOIN LATERAL (
  SELECT coalesce(sum(
    CASE
      WHEN b."writtenOffAt" IS NOT NULL OR (b."isOpened" AND b."fillLevel" = 0) THEN 0
      WHEN b."isOpened" THEN coalesce(b."cigarsLeft", 1)
      WHEN b."cigarsPerBox" IS NOT NULL THEN greatest(coalesce(b."quantity", 1), 0) * b."cigarsPerBox"
      ELSE greatest(coalesce(b."quantity", 1), 0)
    END
  ), 0)::integer AS "units"
  FROM "bottles" AS b
  WHERE b."productId" = p."id" AND b."deletedAt" IS NULL
) AS s
ORDER BY p."createdAt", p."id";

-- Invariant: exactly one first line per wine.
DO $$
DECLARE
  wines integer;
  firsts integer;
BEGIN
  SELECT count(*) INTO wines FROM "products";
  SELECT count(*) INTO firsts FROM "stock_movements" WHERE "kind" = 'INITIAL';
  IF wines <> firsts THEN
    RAISE EXCEPTION 'stock_movements: % first lines for % wines', firsts, wines;
  END IF;
  RAISE NOTICE 'stock_movements: journal started for % wines', wines;
END $$;
