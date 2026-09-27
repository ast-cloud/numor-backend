/*
  Warnings:

  - You are about to drop the column `userId` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `custom_field_definitions` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `invoice_custom_field_values` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orgId,name]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,name]` on the table `custom_field_definitions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orgId` to the `invoice_custom_field_values` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_userId_fkey";

-- DropForeignKey
ALTER TABLE "custom_field_definitions" DROP CONSTRAINT "custom_field_definitions_userId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_userId_fkey";

-- DropIndex
DROP INDEX "clients_userId_idx";

-- DropIndex
DROP INDEX "clients_userId_name_key";

-- DropIndex
DROP INDEX "custom_field_definitions_userId_idx";

-- DropIndex
DROP INDEX "custom_field_definitions_userId_name_key";

-- DropIndex
DROP INDEX "invoice_custom_field_values_userId_idx";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT;

-- AlterTable
ALTER TABLE "custom_field_definitions" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT;

-- AlterTable
ALTER TABLE "invoice_custom_field_values" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX "clients_orgId_idx" ON "clients"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_orgId_name_key" ON "clients"("orgId", "name");

-- CreateIndex
CREATE INDEX "custom_field_definitions_orgId_idx" ON "custom_field_definitions"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_orgId_name_key" ON "custom_field_definitions"("orgId", "name");

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_orgId_idx" ON "invoice_custom_field_values"("orgId");

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
