-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "customUnitsInvoice" TEXT[] DEFAULT ARRAY[]::TEXT[];
