-- CreateEnum
CREATE TYPE "CAStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "ca_profiles" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "experienceYears" INTEGER NOT NULL,
    "hourlyFee" DECIMAL(10,2) NOT NULL,
    "bio" TEXT,
    "languages" TEXT[],
    "specializations" TEXT[],
    "calendlyUrl" TEXT,
    "calComUrl" TEXT,
    "zoomEmail" TEXT,
    "whatsappNumber" TEXT,
    "status" "CAStatus" NOT NULL DEFAULT 'PENDING',
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ca_bookings" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "consultationMode" "ConsultationMode" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "meetingLink" TEXT,
    "meetingProvider" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "BookingStatus" NOT NULL DEFAULT 'INITIATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_bookings_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_userId_key" ON "ca_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_profiles_registrationNo_key" ON "ca_profiles"("registrationNo");

-- CreateIndex
CREATE INDEX "ca_bookings_userId_idx" ON "ca_bookings"("userId");

-- CreateIndex
CREATE INDEX "ca_bookings_caProfileId_idx" ON "ca_bookings"("caProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_payments_bookingId_key" ON "ca_payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_reviews_bookingId_key" ON "ca_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "ca_reviews_caProfileId_idx" ON "ca_reviews"("caProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ca_analytics_snapshots_caProfileId_snapshotDate_key" ON "ca_analytics_snapshots"("caProfileId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "ca_profiles" ADD CONSTRAINT "ca_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_bookings" ADD CONSTRAINT "ca_bookings_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_payments" ADD CONSTRAINT "ca_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_reviews" ADD CONSTRAINT "ca_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_analytics_snapshots" ADD CONSTRAINT "ca_analytics_snapshots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
