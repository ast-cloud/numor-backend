-- Soft-delete clients by timestamp rather than a boolean.
--
-- isActive carried exactly one meaning - "deleted" - so it is replaced rather
-- than kept alongside, which would leave two flags for one state. Postgres runs
-- DDL transactionally, so the backfill below is committed before the drop or
-- neither happens.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" BIGINT;

-- Carry over anything already retired under the old flag. updatedAt is the best
-- available estimate of when: deactivating a client was itself an update, and it
-- is the only timestamp that moved. deletedBy stays NULL - it was never recorded.
UPDATE "clients"
SET "deletedAt" = COALESCE("updatedAt", now())
WHERE "isActive" = false;

-- DropColumn
ALTER TABLE "clients" DROP COLUMN "isActive";

-- Every client lookup filters on this, so index the live ones per org.
CREATE INDEX "clients_orgId_deletedAt_idx" ON "clients"("orgId", "deletedAt");
