/*
  Warnings:

  - A unique constraint covering the columns `[slotId]` on the table `ca_bookings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slotId` to the `ca_bookings` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'HOLD', 'BOOKED');

-- AlterTable
ALTER TABLE "ca_bookings" ADD COLUMN     "slotId" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "ca_slots" (
    "id" BIGSERIAL NOT NULL,
    "caProfileId" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bookingId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ca_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ca_slots_bookingId_key" ON "ca_slots"("bookingId");

-- CreateIndex
CREATE INDEX "ca_slots_caProfileId_date_idx" ON "ca_slots"("caProfileId", "date");

-- CreateIndex
CREATE INDEX "ca_slots_status_idx" ON "ca_slots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ca_bookings_slotId_key" ON "ca_bookings"("slotId");

-- AddForeignKey
ALTER TABLE "ca_slots" ADD CONSTRAINT "ca_slots_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ca_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ca_slots" ADD CONSTRAINT "ca_slots_caProfileId_fkey" FOREIGN KEY ("caProfileId") REFERENCES "ca_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
