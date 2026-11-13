-- #468: no sensor bridge exists (climate sensors were dropped, #747), so the
-- `sensor` reading source goes. A reading posted with it through the API is
-- kept, as a manual one, before the value leaves the enum.
UPDATE "humidor_readings" SET "source" = 'manual' WHERE "source" = 'sensor';

CREATE TYPE "HumidorReadingSource_new" AS ENUM ('manual');
ALTER TABLE "humidor_readings" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "humidor_readings" ALTER COLUMN "source" TYPE "HumidorReadingSource_new" USING ("source"::text::"HumidorReadingSource_new");
ALTER TYPE "HumidorReadingSource" RENAME TO "HumidorReadingSource_old";
ALTER TYPE "HumidorReadingSource_new" RENAME TO "HumidorReadingSource";
DROP TYPE "HumidorReadingSource_old";
ALTER TABLE "humidor_readings" ALTER COLUMN "source" SET DEFAULT 'manual';
