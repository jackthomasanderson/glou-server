-- FEAT-56: Setup Wizard d'Onboarding

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);
