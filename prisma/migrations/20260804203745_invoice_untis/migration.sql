-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "activeUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[];
