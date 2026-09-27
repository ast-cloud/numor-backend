/*
  Warnings:

  - A unique constraint covering the columns `[linkedinId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthProvider" ADD VALUE 'LINKEDIN';
ALTER TYPE "AuthProvider" ADD VALUE 'APPLE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "linkedinId" TEXT,
ADD COLUMN     "widgets" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "users_linkedinId_key" ON "users"("linkedinId");
