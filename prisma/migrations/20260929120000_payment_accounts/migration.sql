-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" BIGSERIAL NOT NULL,
    "orgId" BIGINT NOT NULL,
    "nickname" TEXT NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "swift" TEXT,
    "bankAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_accounts_orgId_idx" ON "payment_accounts"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_orgId_nickname_key" ON "payment_accounts"("orgId", "nickname");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
