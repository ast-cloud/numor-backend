-- AlterTable
ALTER TABLE "custom_field_definitions" ADD COLUMN     "predefinedValues" TEXT[] DEFAULT ARRAY[]::TEXT[];
