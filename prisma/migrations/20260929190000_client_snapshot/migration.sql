-- The billed party, copied onto the invoice the way the seller already is.
-- clientId alone is a pointer: ON DELETE SET NULL wipes it from every invoice
-- when a client is deleted, and editing a client rewrites what past invoices
-- render. These columns hold what was actually billed.

-- AlterTable
ALTER TABLE "invoice_bills" ADD COLUMN     "clientCity" TEXT,
ADD COLUMN     "clientCompanyType" TEXT,
ADD COLUMN     "clientCountry" TEXT,
ADD COLUMN     "clientEmail" CITEXT,
ADD COLUMN     "clientName" CITEXT,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "clientState" TEXT,
ADD COLUMN     "clientStreetAddress" TEXT,
ADD COLUMN     "clientTaxId" TEXT,
ADD COLUMN     "clientTaxSystem" TEXT,
ADD COLUMN     "clientZipCode" TEXT;

-- Backfill from the still-attached client, so invoices that already exist keep
-- their billing details the moment the read path starts preferring these
-- columns. Invoices whose client was already deleted have nothing to recover
-- and stay NULL - the read path falls back to the relation, which is also null.
UPDATE "invoice_bills" AS i
SET "clientName"          = c."name",
    "clientEmail"         = c."email",
    "clientPhone"         = c."phone",
    "clientStreetAddress" = c."streetAddress",
    "clientCity"          = c."city",
    "clientState"         = c."state",
    "clientZipCode"       = c."zipCode",
    "clientCountry"       = c."country",
    "clientTaxId"         = c."taxId",
    "clientTaxSystem"     = c."taxSystem"::text,
    "clientCompanyType"   = c."companyType"
FROM "clients" AS c
WHERE i."clientId" = c."id";
