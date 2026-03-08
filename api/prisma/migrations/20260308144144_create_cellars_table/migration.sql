-- CreateEnum
CREATE TYPE "CellarType" AS ENUM ('VINTAGE', 'COOLER', 'SHELF');

-- CreateTable
CREATE TABLE "cellars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CellarType" NOT NULL DEFAULT 'VINTAGE',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cellars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cellars_userId_idx" ON "cellars"("userId");

-- AddForeignKey
ALTER TABLE "cellars" ADD CONSTRAINT "cellars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
