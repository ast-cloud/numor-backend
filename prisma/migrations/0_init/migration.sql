-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public" VERSION "1.6";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog" VERSION "1.0";

-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'LINKEDIN', 'APPLE');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."CABOOKINGTypeOfCall" AS ENUM ('PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."CADocumentType" AS ENUM ('CERTIFICATION', 'ID_PROOF');

-- CreateEnum
CREATE TYPE "public"."CAPendingStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."CASlotTypeOfCall" AS ENUM ('BOTH', 'PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."CAStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "public"."ConsultationMode" AS ENUM ('VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "public"."DocumentOperation" AS ENUM ('ADD', 'DELETE', 'UPDATE');

-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('CREATED', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PdfStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'SME_USER', 'CA_USER');

-- CreateEnum
CREATE TYPE "public"."SlotStatus" AS ENUM ('AVAILABLE', 'HOLD', 'BOOKED');

-- CreateEnum
CREATE TYPE "public"."TaxSystem" AS ENUM ('GST', 'VAT', 'SALES', 'NONE');

-- CreateEnum
CREATE TYPE "public"."UserType" AS ENUM ('INTERNAL', 'EXTERNAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."WeekDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "public"."ca_analytics_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "earnings" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "ca_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_bookings" (
    "id" BIGSERIAL NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "slotId" BIGINT NOT NULL,
    "consultationMode" "public"."ConsultationMode" NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "meetingLink" TEXT,
    "meetingProvider" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'INITIATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingDate" DATE NOT NULL,
    "endTime" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "startTime" TEXT NOT NULL,
    "taxPercent" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "ca_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_documents" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "type" "public"."CADocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mimeType" TEXT,

    CONSTRAINT "ca_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_documents_pending" (
    "id" BIGSERIAL NOT NULL,
    "pendingId" BIGINT NOT NULL,
    "type" "public"."CADocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "description" TEXT,
    "operation" "public"."DocumentOperation" NOT NULL DEFAULT 'ADD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ca_documents_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_payments" (
    "id" BIGSERIAL NOT NULL,
    "bookingId" BIGINT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_profiles" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "registrationNo" TEXT,
    "experienceYears" INTEGER,
    "hourlyFee" DECIMAL(10,2),
    "bio" TEXT,
    "languages" TEXT[],
    "specializations" TEXT[],
    "type" TEXT,
    "calendlyUrl" TEXT,
    "calComUrl" TEXT,
    "zoomEmail" CITEXT,
    "whatsappNumber" TEXT,
    "status" "public"."CAStatus" NOT NULL DEFAULT 'PENDING',
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "state" TEXT,
    "streetAddress" TEXT,
    "zipCode" TEXT,
    "comment" TEXT,
    "googleAccessToken" TEXT,
    "googleCalendarConnected" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarEmail" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "taxPercent" DECIMAL(10,2),

    CONSTRAINT "ca_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_profiles_pending" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "registrationNo" TEXT,
    "experienceYears" INTEGER,
    "hourlyFee" DECIMAL(10,2),
    "bio" TEXT,
    "languages" TEXT[],
    "specializations" TEXT[],
    "type" TEXT,
    "calendlyUrl" TEXT,
    "calComUrl" TEXT,
    "zoomEmail" CITEXT,
    "whatsappNumber" TEXT,
    "city" TEXT,
    "country" TEXT,
    "state" TEXT,
    "streetAddress" TEXT,
    "zipCode" TEXT,
    "status" "public"."CAPendingStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_profiles_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_reviews" (
    "id" BIGSERIAL NOT NULL,
    "bookingId" BIGINT NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ca_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ca_slots" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "day" "public"."WeekDay" NOT NULL DEFAULT 'MONDAY',
    "typeOfCall" "public"."CASlotTypeOfCall" NOT NULL DEFAULT 'BOTH',

    CONSTRAINT "ca_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checkpoint_blobs" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" BYTEA,

    CONSTRAINT "checkpoint_blobs_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","channel","version")
);

-- CreateTable
CREATE TABLE "public"."checkpoint_migrations" (
    "v" INTEGER NOT NULL,

    CONSTRAINT "checkpoint_migrations_pkey" PRIMARY KEY ("v")
);

-- CreateTable
CREATE TABLE "public"."checkpoint_writes" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT,
    "blob" BYTEA NOT NULL,

    CONSTRAINT "checkpoint_writes_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","checkpoint_id","task_id","idx")
);

-- CreateTable
CREATE TABLE "public"."checkpoints" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "parent_checkpoint_id" TEXT,
    "type" TEXT,
    "checkpoint" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","checkpoint_id")
);

-- CreateTable
CREATE TABLE "public"."clients" (
    "id" BIGSERIAL NOT NULL,
    "name" CITEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "companyType" TEXT,
    "taxId" TEXT,
    "taxSystem" "public"."TaxSystem" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" BIGINT NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."custom_field_definitions" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" BIGINT NOT NULL,
    "predefinedValues" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_bill_items" (
    "id" BIGSERIAL NOT NULL,
    "expenseId" BIGINT NOT NULL,
    "itemName" TEXT,
    "quantity" DECIMAL(15,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "totalPrice" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxRate" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "unitType" TEXT DEFAULT 'UNIT',

    CONSTRAINT "expense_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_bills" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "createdById" BIGINT,
    "merchant" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "paymentMethod" TEXT,
    "receiptUrl" TEXT,
    "ocrExtracted" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalTax" DECIMAL(15,2) DEFAULT 0.00,
    "updatedById" BIGINT,

    CONSTRAINT "expense_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_bill_items" (
    "id" BIGSERIAL NOT NULL,
    "invoiceId" BIGINT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "taxRate" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitType" TEXT DEFAULT 'UNIT',

    CONSTRAINT "invoice_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_bills" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "clientId" BIGINT,
    "createdById" BIGINT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL DEFAULT 'TAX',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(10,4),
    "baseCurrency" TEXT DEFAULT 'INR',
    "baseAmount" DECIMAL(15,2),
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "shippingCost" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "balanceDue" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "effectiveTax" DECIMAL(65,30) DEFAULT 0.00,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "pdfKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "sellerName" CITEXT,
    "sellerStreetAddress" TEXT,
    "sellerCity" TEXT,
    "sellerState" TEXT,
    "sellerZipCode" TEXT,
    "sellerCountry" TEXT,
    "sellerEmail" CITEXT,
    "sellerPhone" TEXT,
    "sellerTaxId" TEXT,
    "iecCode" TEXT,
    "lutFiled" BOOLEAN NOT NULL DEFAULT false,
    "taxType" TEXT NOT NULL DEFAULT 'NONE',
    "placeOfSupply" TEXT,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "reverseReason" TEXT,
    "sacCode" TEXT,
    "taxSummary" JSONB,
    "shipToName" TEXT,
    "shipToAddress" TEXT,
    "countryOfOrigin" TEXT,
    "countryOfDestination" TEXT,
    "incoterms" TEXT,
    "bankDetails" JSONB,
    "paymentLink" TEXT,
    "bankAddress" TEXT,
    "jurisdiction" TEXT,
    "lateFeePolicy" TEXT,
    "notes" TEXT,
    "pdfStatus" "public"."PdfStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellerTaxSystem" TEXT,
    "updatedById" BIGINT,
    "idempotencyKey" TEXT,
    "pdfLeaseExpiresAt" TIMESTAMP(3),
    "pdfAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailSentAt" TIMESTAMP(3),
    "emailStatus" "public"."EmailStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "emailError" TEXT,
    "emailRequested" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "invoice_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_custom_field_values" (
    "id" BIGSERIAL NOT NULL,
    "invoiceId" BIGINT NOT NULL,
    "customFieldId" BIGINT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" BIGINT NOT NULL,

    CONSTRAINT "invoice_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."kpi_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalIncome" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "totalExpenses" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "netCashflow" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "outstandingReceivables" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "overdueInvoicesCount" INTEGER NOT NULL DEFAULT 0,
    "topExpenseCategory" TEXT,
    "expenseGrowthPercent" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" BIGSERIAL NOT NULL,
    "name" CITEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_invitations" (
    "id" BIGSERIAL NOT NULL,
    "organizationId" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "userType" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "passwordHash" TEXT,
    "authProvider" "public"."AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "googleId" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'SME_USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resetPasswordExpiresAt" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "profilePhotoKey" TEXT,
    "linkedinId" TEXT,
    "widgets" TEXT[],
    "isOrgOwner" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ca_analytics_snapshots_caProfileId_snapshotDate_key" ON "public"."ca_analytics_snapshots"("caProfileId" ASC, "snapshotDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_bookings_bookingCode_key" ON "public"."ca_bookings"("bookingCode" ASC);

-- CreateIndex
CREATE INDEX "ca_bookings_caProfileId_idx" ON "public"."ca_bookings"("caProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_bookings_slotId_bookingDate_key" ON "public"."ca_bookings"("slotId" ASC, "bookingDate" ASC);

-- CreateIndex
CREATE INDEX "ca_bookings_userId_idx" ON "public"."ca_bookings"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_documents_fileKey_key" ON "public"."ca_documents"("fileKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_documents_pending_fileKey_key" ON "public"."ca_documents_pending"("fileKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_payments_bookingId_key" ON "public"."ca_payments"("bookingId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_registrationNo_key" ON "public"."ca_profiles"("registrationNo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_userId_key" ON "public"."ca_profiles"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_pending_caProfileId_key" ON "public"."ca_profiles_pending"("caProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ca_reviews_bookingId_key" ON "public"."ca_reviews"("bookingId" ASC);

-- CreateIndex
CREATE INDEX "ca_reviews_caProfileId_idx" ON "public"."ca_reviews"("caProfileId" ASC);

-- CreateIndex
CREATE INDEX "ca_slots_caProfileId_day_idx" ON "public"."ca_slots"("caProfileId" ASC, "day" ASC);

-- CreateIndex
CREATE INDEX "clients_orgId_idx" ON "public"."clients"("orgId" ASC);

-- CreateIndex
CREATE INDEX "custom_field_definitions_orgId_idx" ON "public"."custom_field_definitions"("orgId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_orgId_name_key" ON "public"."custom_field_definitions"("orgId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "expense_bill_items_expenseId_idx" ON "public"."expense_bill_items"("expenseId" ASC);

-- CreateIndex
CREATE INDEX "expense_bills_createdById_idx" ON "public"."expense_bills"("createdById" ASC);

-- CreateIndex
CREATE INDEX "expense_bills_orgId_idx" ON "public"."expense_bills"("orgId" ASC);

-- CreateIndex
CREATE INDEX "invoice_bills_clientId_idx" ON "public"."invoice_bills"("clientId" ASC);

-- CreateIndex
CREATE INDEX "invoice_bills_createdById_issueDate_idx" ON "public"."invoice_bills"("createdById" ASC, "issueDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_bills_orgId_idempotencyKey_key" ON "public"."invoice_bills"("orgId" ASC, "idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_customFieldId_idx" ON "public"."invoice_custom_field_values"("customFieldId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_custom_field_values_invoiceId_customFieldId_key" ON "public"."invoice_custom_field_values"("invoiceId" ASC, "customFieldId" ASC);

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_invoiceId_idx" ON "public"."invoice_custom_field_values"("invoiceId" ASC);

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_orgId_idx" ON "public"."invoice_custom_field_values"("orgId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_snapshots_orgId_snapshotDate_key" ON "public"."kpi_snapshots"("orgId" ASC, "snapshotDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_email_key" ON "public"."organizations"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_email_key" ON "public"."user_invitations"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_key" ON "public"."user_invitations"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "public"."users"("googleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_linkedinId_key" ON "public"."users"("linkedinId" ASC);

-- AddForeignKey
ALTER TABLE "public"."ca_analytics_snapshots" ADD CONSTRAINT "ca_analytics_snapshots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_bookings" ADD CONSTRAINT "ca_bookings_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_bookings" ADD CONSTRAINT "ca_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "public"."ca_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_bookings" ADD CONSTRAINT "ca_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_documents" ADD CONSTRAINT "ca_documents_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_documents_pending" ADD CONSTRAINT "ca_documents_pending_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "public"."ca_profiles_pending"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_payments" ADD CONSTRAINT "ca_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."ca_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_profiles" ADD CONSTRAINT "ca_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_profiles_pending" ADD CONSTRAINT "ca_profiles_pending_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_reviews" ADD CONSTRAINT "ca_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."ca_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_reviews" ADD CONSTRAINT "ca_reviews_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_reviews" ADD CONSTRAINT "ca_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ca_slots" ADD CONSTRAINT "ca_slots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "public"."ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."clients" ADD CONSTRAINT "clients_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_bill_items" ADD CONSTRAINT "expense_bill_items_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."expense_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_bills" ADD CONSTRAINT "expense_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_bills" ADD CONSTRAINT "expense_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_bills" ADD CONSTRAINT "expense_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_bill_items" ADD CONSTRAINT "invoice_bill_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoice_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_bills" ADD CONSTRAINT "invoice_bills_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_bills" ADD CONSTRAINT "invoice_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_bills" ADD CONSTRAINT "invoice_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_bills" ADD CONSTRAINT "invoice_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "public"."custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoice_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_invitations" ADD CONSTRAINT "user_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
