/*
  Warnings:

  - You are about to drop the column `gstin` on the `clients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clients" DROP COLUMN "gstin";

-- AlterTable
ALTER TABLE "invoice_bills" ADD COLUMN     "sellerTaxSystem" TEXT;

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_custom_field_values" (
    "id" BIGSERIAL NOT NULL,
    "invoiceId" BIGINT NOT NULL,
    "customFieldId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_field_definitions_userId_idx" ON "custom_field_definitions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_userId_name_key" ON "custom_field_definitions"("userId", "name");

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_invoiceId_idx" ON "invoice_custom_field_values"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_customFieldId_idx" ON "invoice_custom_field_values"("customFieldId");

-- CreateIndex
CREATE INDEX "invoice_custom_field_values_userId_idx" ON "invoice_custom_field_values"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_custom_field_values_invoiceId_customFieldId_key" ON "invoice_custom_field_values"("invoiceId", "customFieldId");

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "custom_field_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
