/*
  Warnings:

  - You are about to drop the column `slogan` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "slogan",
ADD COLUMN     "appName" TEXT,
ADD COLUMN     "appSlogan" TEXT,
ADD COLUMN     "avatarUrl" TEXT;
