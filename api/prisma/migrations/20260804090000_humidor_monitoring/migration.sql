-- Data-model audit (Task 4): cigar humidor hygrometric monitoring.
--
-- Constat : le schéma n'a pas de concept de "cave dédiée cigares" — `Cellar`
-- sert de conteneur générique (VINTAGE/COOLER/SHELF) réutilisé pour toutes
-- les catégories, cigares compris. Plutôt que de créer un nouveau concept
-- parallèle, on ajoute une 4e valeur d'enum (HUMIDOR) à CellarType : la
-- fiche "Cave" existante (web/app/cellars/[id]/page.tsx) sert de fiche
-- humidor pour toute cave de ce type (ou toute cave contenant déjà des
-- cigares — voir la condition d'affichage côté page, volontairement pas
-- restreinte à type=HUMIDOR pour ne pas forcer une migration des caves
-- SHELF/VINTAGE existantes qui stockent déjà des cigares).
--
-- Le rattachement de HumidorReading se fait au niveau Cellar, pas
-- InventoryItem : un hygromètre physique surveille l'ensemble du contenant,
-- pas une boîte de cigares individuelle.
--
-- `ALTER TYPE ... ADD VALUE` is safe inside this migration's transaction on
-- Postgres 12+ as long as the new value isn't used by a DML statement in the
-- very same transaction — it isn't, this migration only alters schema.

ALTER TYPE "CellarType" ADD VALUE 'HUMIDOR';

-- CreateEnum
CREATE TYPE "HumidorReadingSource" AS ENUM ('manual', 'sensor');

-- AlterTable: target hygrometry range (Task 4 — "68-72%" example), used to
-- flag drift on the latest reading. Both null = monitoring stays inactive.
ALTER TABLE "cellars"
  ADD COLUMN "targetHumidityMin" DOUBLE PRECISION,
  ADD COLUMN "targetHumidityMax" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "humidor_readings" (
    "id" TEXT NOT NULL,
    "cellarId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "humidityPercent" DOUBLE PRECISION NOT NULL,
    "temperatureCelsius" DOUBLE PRECISION,
    "source" "HumidorReadingSource" NOT NULL DEFAULT 'manual',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "humidor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "humidor_readings_cellarId_recordedAt_idx" ON "humidor_readings"("cellarId", "recordedAt");

-- AddForeignKey
ALTER TABLE "humidor_readings" ADD CONSTRAINT "humidor_readings_cellarId_fkey" FOREIGN KEY ("cellarId") REFERENCES "cellars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "humidor_readings" ADD CONSTRAINT "humidor_readings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
