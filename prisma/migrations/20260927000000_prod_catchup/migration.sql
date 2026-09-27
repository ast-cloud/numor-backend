-- Brings production up to prisma/schema.prisma WITHOUT losing data.
--
-- Prisma's own diff wanted to DROP customerId / userId / status / pdfStatus and
-- re-add them, because `migrate diff` cannot recognise a rename or a type
-- change. Every one of those is rewritten here as a RENAME or an ALTER ... USING
-- cast, which Postgres performs in place.
--
-- Wrapped in a transaction: Postgres DDL is transactional, so if any statement
-- fails, nothing is applied.
--
-- Run this ONCE, then re-run `prisma migrate diff` - what remains should be only
-- foreign-key churn from the cascade changes, which is safe to apply as-is.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'OVERDUE');
CREATE TYPE "EmailStatus"   AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED');
CREATE TYPE "PdfStatus"     AS ENUM ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- ---------------------------------------------------------------------------
-- 2. expense_bills.userId -> createdById
--
-- RENAME is metadata-only: no rows are rewritten and all 47 creator references
-- survive. The constraint and index are renamed too, so their names match what
-- Prisma expects and it does not try to recreate them later.
-- ---------------------------------------------------------------------------
ALTER TABLE "expense_bills" RENAME COLUMN "userId" TO "createdById";
ALTER TABLE "expense_bills" RENAME CONSTRAINT "expense_bills_userId_fkey" TO "expense_bills_createdById_fkey";
ALTER INDEX "expense_bills_userId_idx" RENAME TO "expense_bills_createdById_idx";

ALTER TABLE "expense_bills" ADD COLUMN "updatedById" BIGINT;

-- ---------------------------------------------------------------------------
-- 3. invoice_bills.customerId -> createdById
-- ---------------------------------------------------------------------------
ALTER TABLE "invoice_bills" RENAME COLUMN "customerId" TO "createdById";
ALTER TABLE "invoice_bills" RENAME CONSTRAINT "invoice_bills_customerId_fkey" TO "invoice_bills_createdById_fkey";

ALTER TABLE "invoice_bills" ADD COLUMN "updatedById" BIGINT;

-- ---------------------------------------------------------------------------
-- 4. New columns: idempotency and the PDF/email lifecycles
-- ---------------------------------------------------------------------------
ALTER TABLE "invoice_bills"
  ADD COLUMN "idempotencyKey"    TEXT,
  ADD COLUMN "pdfLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "pdfAttempts"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailSentAt"       TIMESTAMP(3),
  ADD COLUMN "emailStatus"       "EmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN "emailError"        TEXT;

-- ---------------------------------------------------------------------------
-- 5. status -> InvoiceStatus
--
-- All four values present in production (OVERDUE, UNPAID, DRAFT, PAID) are
-- already valid members, so the cast needs no normalisation. The default is
-- dropped first because Postgres cannot cast the old TEXT default expression.
-- ---------------------------------------------------------------------------
ALTER TABLE "invoice_bills" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoice_bills" ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus";
ALTER TABLE "invoice_bills" ALTER COLUMN "status" SET DEFAULT 'UNPAID';

-- ---------------------------------------------------------------------------
-- 6. pdfStatus -> PdfStatus
--
-- Two legacy values have to be mapped before the cast:
--   'DRAFT'      - the old DLQ callback wrote this to mean "generation failed",
--                  which collided with the invoice's own DRAFT status. That
--                  meaning is now FAILED. (5 rows, none with a pdfKey.)
--   'PROCESSING' with no pdfKey - a worker died mid-run and nothing ever
--                  finished the job. FAILED is re-queueable; PROCESSING is not,
--                  so leaving these would strand them forever. (2 rows.)
-- ---------------------------------------------------------------------------
UPDATE "invoice_bills" SET "pdfStatus" = 'FAILED' WHERE "pdfStatus" = 'DRAFT';

UPDATE "invoice_bills" SET "pdfStatus" = 'FAILED'
 WHERE "pdfStatus" = 'PROCESSING' AND "pdfKey" IS NULL;

UPDATE "invoice_bills" SET "pdfStatus" = 'FAILED'
 WHERE "pdfStatus" NOT IN ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "invoice_bills" ALTER COLUMN "pdfStatus" DROP DEFAULT;
ALTER TABLE "invoice_bills" ALTER COLUMN "pdfStatus" TYPE "PdfStatus" USING "pdfStatus"::"PdfStatus";
ALTER TABLE "invoice_bills" ALTER COLUMN "pdfStatus" SET DEFAULT 'NOT_STARTED';

-- ---------------------------------------------------------------------------
-- 7. Indexes
--
-- The unique index is safe on existing rows: every one has a NULL
-- idempotencyKey, and Postgres treats NULLs as distinct.
-- ---------------------------------------------------------------------------
CREATE INDEX "invoice_bills_createdById_issueDate_idx" ON "invoice_bills"("createdById", "issueDate");
CREATE UNIQUE INDEX "invoice_bills_orgId_idempotencyKey_key" ON "invoice_bills"("orgId", "idempotencyKey");

-- ---------------------------------------------------------------------------
-- 8. Tightening - verified 0 NULL rows in both before writing this
-- ---------------------------------------------------------------------------
ALTER TABLE "clients" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "custom_field_definitions" ALTER COLUMN "orgId" SET NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- Column documentation read by the chatbot's SQL layer
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "invoice_bills"."status" IS
  'Payment state: one of DRAFT, UNPAID, PAID, OVERDUE. EXCLUDE DRAFT from any revenue figure - drafts are not real income. Whether the invoice was delivered is recorded separately by sentAt.';
COMMENT ON COLUMN "invoice_bills"."pdfStatus" IS
  'Lifecycle of the generated invoice PDF: NOT_STARTED (draft/unconfirmed), QUEUED, PROCESSING, READY (pdfKey is set), FAILED (retries exhausted; re-queueable).';
COMMENT ON COLUMN "invoice_bills"."idempotencyKey" IS
  'Client-supplied key identifying one invoice-creation intent. Reused across retries so a lost response cannot produce a duplicate invoice.';
COMMENT ON COLUMN "invoice_bills"."createdById" IS
  'The Numor user who created the invoice (FK users.id). Not the party being billed - that is clientId.';
COMMENT ON COLUMN "expense_bills"."createdById" IS
  'The Numor user who recorded the expense (FK users.id). NULL if that user has since been deleted.';
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
ALTER TABLE "clients" DROP CONSTRAINT "clients_orgId_fkey";

-- DropForeignKey
ALTER TABLE "custom_field_definitions" DROP CONSTRAINT "custom_field_definitions_orgId_fkey";

-- DropForeignKey
ALTER TABLE "expense_bills" DROP CONSTRAINT "expense_bills_orgId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bill_items" DROP CONSTRAINT "invoice_bill_items_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bills" DROP CONSTRAINT "invoice_bills_createdById_fkey";

-- DropForeignKey
ALTER TABLE "invoice_bills" DROP CONSTRAINT "invoice_bills_orgId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_customFieldId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_orgId_fkey";

-- DropForeignKey
ALTER TABLE "kpi_snapshots" DROP CONSTRAINT "kpi_snapshots_orgId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_orgId_fkey";

-- AlterTable
ALTER TABLE "invoice_bills" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
