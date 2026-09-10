-- FEAT-86: Forme de Courbe de Consommation & Règles de Priorité

-- New enum for the consumption/aging curve shape
CREATE TYPE "CurveShape" AS ENUM ('LINEAR', 'BELL', 'EARLY_BELL', 'LATE_BELL', 'TWIN_PEAK', 'PLATEAU');

-- Per-bottle effective curve shape (nullable = inherit the LINEAR default).
-- Copied from the matching MaturityReference at entry time, then user-overridable.
ALTER TABLE "bottles" ADD COLUMN "curveShape" "CurveShape";

-- Per-reference curve shape + explicit cascade priority.
ALTER TABLE "maturity_references" ADD COLUMN "curveShape" "CurveShape" NOT NULL DEFAULT 'LINEAR';
ALTER TABLE "maturity_references" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
