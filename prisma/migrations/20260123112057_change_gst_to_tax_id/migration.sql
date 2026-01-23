/*
  Warnings:

  - You are about to drop the column `gstin` on the `organizations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "gstin",
ADD COLUMN     "taxId" TEXT;
