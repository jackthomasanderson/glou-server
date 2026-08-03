-- FEAT-08: Plan de Consommation Intelligent & Rotation de Stock

-- AlterTable
ALTER TABLE "bottles" ADD COLUMN     "consumptionPostponedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "consumption_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumption_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumption_goals_userId_idx" ON "consumption_goals"("userId");

-- AddForeignKey
ALTER TABLE "consumption_goals" ADD CONSTRAINT "consumption_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
