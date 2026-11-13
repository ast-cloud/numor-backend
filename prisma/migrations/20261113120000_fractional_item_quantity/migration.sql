-- Keep fractional item quantities as entered.
--
-- Both quantity columns held two decimal places, so Postgres silently rounded a
-- quantity like 0.045 to 0.05 on insert. The totals were already computed from
-- the unrounded request value, so the stored row no longer multiplied out to its
-- own total, and a later edit that recalculated from the stored items moved the
-- invoice total.
--
-- Four decimal places, with precision raised so neither column loses integer
-- digits (invoice items had 8, expense items 13). Existing values widen without
-- change; rows already rounded stay rounded until re-saved.

-- AlterTable
ALTER TABLE "invoice_bill_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(17,4);

-- AlterTable
ALTER TABLE "expense_bill_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(17,4);
