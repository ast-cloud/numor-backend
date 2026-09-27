-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "DocumentOperation" AS ENUM ('ADD', 'DELETE', 'UPDATE');

-- CreateEnum
CREATE TYPE "CADocumentType" AS ENUM ('CERTIFICATION', 'ID_PROOF');

-- CreateEnum
CREATE TYPE "CASlotTypeOfCall" AS ENUM ('BOTH', 'PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "CABOOKINGTypeOfCall" AS ENUM ('PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL', 'EXTERNAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SME_USER', 'CA_USER');

-- CreateEnum
CREATE TYPE "TaxSystem" AS ENUM ('GST', 'VAT', 'SALES', 'NONE');

-- CreateEnum
CREATE TYPE "CAStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CAPendingStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'HOLD', 'BOOKED');

-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "organizations" (
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

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "userType" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "passwordHash" TEXT,
    "profilePhotoKey" TEXT,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "googleId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SME_USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resetPasswordExpiresAt" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "name" CITEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "gstin" TEXT,
    "country" TEXT,
    "companyType" TEXT,
    "taxId" TEXT,
    "taxSystem" "TaxSystem" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_bills" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "clientId" BIGINT,
    "customerId" BIGINT NOT NULL,
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
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
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
    "pdfStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_bill_items" (
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
CREATE TABLE "expense_bills" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "userId" BIGINT,
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

    CONSTRAINT "expense_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_bill_items" (
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
CREATE TABLE "kpi_snapshots" (
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
CREATE TABLE "ca_profiles" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "registrationNo" TEXT,
    "experienceYears" INTEGER,
    "hourlyFee" DECIMAL(10,2),
    "taxPercent" DECIMAL(10,2),
    "bio" TEXT,
    "languages" TEXT[],
    "specializations" TEXT[],
    "type" TEXT,
    "calendlyUrl" TEXT,
    "calComUrl" TEXT,
    "zoomEmail" CITEXT,
    "whatsappNumber" TEXT,
    "status" "CAStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "state" TEXT,
    "streetAddress" TEXT,
    "zipCode" TEXT,
    "googleCalendarConnected" BOOLEAN NOT NULL DEFAULT false,
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "googleCalendarEmail" TEXT,

    CONSTRAINT "ca_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_documents" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "type" "CADocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "mimeType" TEXT,

    CONSTRAINT "ca_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_bookings" (
    "id" BIGSERIAL NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "slotId" BIGINT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "consultationMode" "ConsultationMode" NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "meetingLink" TEXT,
    "meetingProvider" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "taxPercent" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "BookingStatus" NOT NULL DEFAULT 'INITIATED',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_profiles_pending" (
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
    "status" "CAPendingStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_profiles_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_documents_pending" (
    "id" BIGSERIAL NOT NULL,
    "pendingId" BIGINT NOT NULL,
    "type" "CADocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "description" TEXT,
    "operation" "DocumentOperation" NOT NULL DEFAULT 'ADD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ca_documents_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_payments" (
    "id" BIGSERIAL NOT NULL,
    "bookingId" BIGINT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_reviews" (
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
CREATE TABLE "ca_analytics_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "earnings" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "ca_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_slots" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "day" "WeekDay" NOT NULL DEFAULT 'MONDAY',
    "typeOfCall" "CASlotTypeOfCall" NOT NULL DEFAULT 'BOTH',
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_blobs" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" BYTEA,

    CONSTRAINT "checkpoint_blobs_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","channel","version")
);

-- CreateTable
CREATE TABLE "checkpoint_migrations" (
    "v" INTEGER NOT NULL,

    CONSTRAINT "checkpoint_migrations_pkey" PRIMARY KEY ("v")
);

-- CreateTable
CREATE TABLE "checkpoint_writes" (
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
CREATE TABLE "checkpoints" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "parent_checkpoint_id" TEXT,
    "type" TEXT,
    "checkpoint" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("thread_id","checkpoint_ns","checkpoint_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_email_key" ON "organizations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "clients_userId_idx" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_name_key" ON "clients"("userId", "name");

-- CreateIndex
CREATE INDEX "invoice_bills_clientId_idx" ON "invoice_bills"("clientId");

-- CreateIndex
CREATE INDEX "expense_bills_userId_idx" ON "expense_bills"("userId");

-- CreateIndex
CREATE INDEX "expense_bills_orgId_idx" ON "expense_bills"("orgId");

-- CreateIndex
CREATE INDEX "expense_bill_items_expenseId_idx" ON "expense_bill_items"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_snapshots_orgId_snapshotDate_key" ON "kpi_snapshots"("orgId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_userId_key" ON "ca_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_registrationNo_key" ON "ca_profiles"("registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "ca_documents_fileKey_key" ON "ca_documents"("fileKey");

-- CreateIndex
CREATE UNIQUE INDEX "ca_bookings_bookingCode_key" ON "ca_bookings"("bookingCode");

-- CreateIndex
CREATE INDEX "ca_bookings_userId_idx" ON "ca_bookings"("userId");

-- CreateIndex
CREATE INDEX "ca_bookings_caProfileId_idx" ON "ca_bookings"("caProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_bookings_slotId_bookingDate_key" ON "ca_bookings"("slotId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_pending_caProfileId_key" ON "ca_profiles_pending"("caProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_documents_pending_fileKey_key" ON "ca_documents_pending"("fileKey");

-- CreateIndex
CREATE UNIQUE INDEX "ca_payments_bookingId_key" ON "ca_payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_reviews_bookingId_key" ON "ca_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "ca_reviews_caProfileId_idx" ON "ca_reviews"("caProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_analytics_snapshots_caProfileId_snapshotDate_key" ON "ca_analytics_snapshots"("caProfileId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ca_slots_caProfileId_day_idx" ON "ca_slots"("caProfileId", "day");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bills" ADD CONSTRAINT "invoice_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_bill_items" ADD CONSTRAINT "invoice_bill_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bills" ADD CONSTRAINT "expense_bills_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bills" ADD CONSTRAINT "expense_bills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bill_items" ADD CONSTRAINT "expense_bill_items_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_profiles" ADD CONSTRAINT "ca_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_documents" ADD CONSTRAINT "ca_documents_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ca_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_profiles_pending" ADD CONSTRAINT "ca_profiles_pending_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_documents_pending" ADD CONSTRAINT "ca_documents_pending_pendingId_fkey" FOREIGN KEY ("pendingId") REFERENCES "ca_profiles_pending"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_payments" ADD CONSTRAINT "ca_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_analytics_snapshots" ADD CONSTRAINT "ca_analytics_snapshots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_slots" ADD CONSTRAINT "ca_slots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

