-- Keep a custom field on the invoice that used it.
--
-- The value row only pointed at the definition, and the FK cascaded: deleting a
-- definition removed that field from every invoice that ever carried it, with
-- nothing left to recover the name or the value from. The name is now copied
-- onto the row, and the pointer is nulled instead of cascading.

-- DropForeignKey
ALTER TABLE "invoice_custom_field_values" DROP CONSTRAINT "invoice_custom_field_values_customFieldId_fkey";

-- AlterTable
ALTER TABLE "invoice_custom_field_values" ADD COLUMN     "name" TEXT,
ALTER COLUMN "customFieldId" DROP NOT NULL;

-- Backfill from the definition each row still points at, so invoices written
-- before this migration keep their field names once the read path starts
-- preferring the snapshot.
UPDATE "invoice_custom_field_values" AS v
SET "name" = d."name"
FROM "custom_field_definitions" AS d
WHERE v."customFieldId" = d."id";

-- AddForeignKey
ALTER TABLE "invoice_custom_field_values" ADD CONSTRAINT "invoice_custom_field_values_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "custom_field_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
