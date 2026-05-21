-- FEAT-63: Bibliothèque de Références d'Apogée
CREATE TYPE "MaturityMode" AS ENUM ('ABSOLUTE', 'RELATIVE');

CREATE TABLE "maturity_references" (
  "id"          TEXT          NOT NULL,
  "name"        TEXT          NOT NULL,
  "category"    "BottleCategory" NOT NULL,
  "region"      TEXT,
  "color"       TEXT,
  "producer"    TEXT,
  "vintageFrom" INTEGER,
  "vintageTo"   INTEGER,
  "mode"        "MaturityMode" NOT NULL,
  "windowFrom"  INTEGER       NOT NULL,
  "windowTo"    INTEGER       NOT NULL,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "maturity_references_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "maturity_references_category_idx" ON "maturity_references"("category");
