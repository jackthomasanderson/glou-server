-- CreateEnum
CREATE TYPE "BottleCategory" AS ENUM ('wine', 'sparkling', 'spirit', 'cigar');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bottles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "BottleCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "location" TEXT,
    "collection" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrl" TEXT,
    "notes" TEXT,
    "purchasePrice" DOUBLE PRECISION,
    "purchasePlace" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "vintage" INTEGER,
    "color" TEXT,
    "region" TEXT,
    "grapeVarieties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alcoholDegree" DOUBLE PRECISION,
    "bottleSize" TEXT,
    "peakMaturity" TEXT,
    "needsAeration" BOOLEAN,
    "serviceTemp" TEXT,
    "lotNumber" TEXT,
    "batchDate" TIMESTAMP(3),
    "sparklingType" TEXT,
    "sugarLevel" TEXT,
    "disgorgingDate" TIMESTAMP(3),
    "baseYear" INTEGER,
    "distilleryName" TEXT,
    "edition" TEXT,
    "declaredAge" TEXT,
    "caskType" TEXT,
    "additions" TEXT,
    "aromaticProfile" TEXT,
    "brand" TEXT,
    "format" TEXT,
    "quantity" INTEGER,
    "manufactureYear" INTEGER,
    "sealedStatus" TEXT,
    "leafOrigin" TEXT,
    "factoryCode" TEXT,
    "recommendedHumidity" DOUBLE PRECISION,
    "humidificationSystem" TEXT,
    "isOpened" BOOLEAN NOT NULL DEFAULT false,
    "fillLevel" INTEGER,
    "alertStatus" TEXT,
    "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bottles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "bottleId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "bottles_userId_idx" ON "bottles"("userId");
CREATE INDEX "bottles_userId_deletedAt_idx" ON "bottles"("userId", "deletedAt");
CREATE INDEX "bottles_userId_category_idx" ON "bottles"("userId", "category");
CREATE INDEX "bottles_name_idx" ON "bottles"("name");
CREATE INDEX "bottles_vintage_idx" ON "bottles"("vintage");
CREATE INDEX "bottles_producer_idx" ON "bottles"("producer");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_bottleId_fkey" FOREIGN KEY ("bottleId") REFERENCES "bottles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
