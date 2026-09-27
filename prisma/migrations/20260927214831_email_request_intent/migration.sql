/*
  Warnings:

  - You are about to drop the column `userId` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `custom_field_definitions` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `expense_bills` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `invoice_bills` table. All the data in the column will be lost.
  - The `status` column on the `invoice_bills` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `pdfStatus` column on the `invoice_bills` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `userId` on the `invoice_custom_field_values` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orgId,name]` on the table `custom_field_definitions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,idempotencyKey]` on the table `invoice_bills` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orgId` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orgId` to the `custom_field_definitions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orgId` to the `invoice_custom_field_values` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PdfStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- DropForeignKey
ALTER TABLE "ca_analytics_snapshots" DROP CONSTRAINT "ca_analytics_snapshots_caProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ca_bookings" DROP CONSTRAINT "ca_bookings_caProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ca_bookings" DROP CONSTRAINT "ca_bookings_slotId_fkey";

-- DropForeignKey
ALTER TABLE "ca_bookings" DROP CONSTRAINT "ca_bookings_userId_fkey";

-- DropForeignKey
ALTER TABLE "ca_documents" DROP CONSTRAINT "ca_documents_caProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ca_documents_pending" DROP CONSTRAINT "ca_documents_pending_pendingId_fkey";

-- DropForeignKey
ALTER TABLE "ca_payments" DROP CONSTRAINT "ca_payments_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "ca_profiles" DROP CONSTRAINT "ca_profiles_userId_fkey";

-- DropForeignKey
ALTER TABLE "ca_reviews" DROP CONSTRAINT "ca_reviews_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "ca_reviews" DROP CONSTRAINT "ca_reviews_caProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ca_reviews" DROP CONSTRAINT "ca_reviews_userId_fkey";

-- DropForeignKey
ALTER TABLE "ca_slots" DROP CONSTRAINT "ca_slots_caProfileId_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_userId_fkey";

-- DropForeignKey
ALTER TABLE "custom_field_definitions" DROP CONSTRAINT "custom_field_definitions_userId_fkey";

-- DropForeignKey
ALTER TABLE "expense_bills" DROP CONSTRAINT "expense_bills_orgId_fkey";

-- DropForeignKey
ALTER TABLE "expense_bills" DROP CONSTRAINT "expense_bills_userId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bill_items" DROP CONSTRAINT "invoice_bill_items_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bills" DROP CONSTRAINT "invoice_bills_customerId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bills" DROP CONSTRAINT "invoice_bills_orgId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_customFieldId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_userId_fkey";

-- DropForeignKey
ALTER TABLE "kpi_snapshots" DROP CONSTRAINT "kpi_snapshots_orgId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_orgId_fkey";

-- DropIndex
DROP INDEX "clients_userId_idx";

-- DropIndex
DROP INDEX "clients_userId_name_key";

-- DropIndex
DROP INDEX "custom_field_definitions_userId_idx";

-- DropIndex
DROP INDEX "custom_field_definitions_userId_name_key";

-- DropIndex
DROP INDEX "expense_bills_userId_idx";

-- DropIndex
DROP INDEX "invoice_custom_field_values_userId_idx";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "custom_field_definitions" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT NOT NULL,
ADD COLUMN     "predefinedValues" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "expense_bills" DROP COLUMN "userId",
ADD COLUMN     "createdById" BIGINT,
ADD COLUMN     "updatedById" BIGINT;

-- AlterTable
ALTER TABLE "invoice_bills" DROP COLUMN "customerId",
ADD COLUMN     "createdById" BIGINT,
ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "EmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "pdfAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pdfLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "updatedById" BIGINT,
DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
DROP COLUMN "pdfStatus",
ADD COLUMN     "pdfStatus" "PdfStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "invoice_custom_field_values" DROP COLUMN "userId",
ADD COLUMN     "orgId" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "activeUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "customUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isOrgOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" BIGSERIAL NOT NULL,
    "organizationId" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_email_key" ON "user_invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_key" ON "user_invitations"("token");

-- CreateIndex
CREATE INDEX "clients_orgId_idx" ON "clients"("orgId");

-- CreateIndex
CREATE INDEX "custom_field_definitions_orgId_idx" ON "custom_field_definitions"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_orgId_name_key" ON "custom_field_definitions"("orgId", "name");

-- CreateIndex
CREATE INDEX "expense_bills_createdById_idx" ON "expense_bills"("createdById");

-- CreateIndex
CREATE INDEX "invoice_bills_createdById_issueDate_idx" ON "invoice_bills"("createdById", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_bills_orgId_idempotencyKey_key" ON "invoice_bills"("orgId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_orgId_idx" ON "invoice_custom_field_values"("orgId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bill_items" ADD CONSTRAINT "invoice_bill_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bills" ADD CONSTRAINT "expense_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bills" ADD CONSTRAINT "expense_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bills" ADD CONSTRAINT "expense_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_profiles" ADD CONSTRAINT "ca_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_documents" ADD CONSTRAINT "ca_documents_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ca_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_documents_pending" ADD CONSTRAINT "ca_documents_pending_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "ca_profiles_pending"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_payments" ADD CONSTRAINT "ca_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_analytics_snapshots" ADD CONSTRAINT "ca_analytics_snapshots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_slots" ADD CONSTRAINT "ca_slots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
