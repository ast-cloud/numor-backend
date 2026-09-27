/*
  Warnings:

  - You are about to drop the column `permissions` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `UserInvitation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserInvitation" DROP CONSTRAINT "UserInvitation_organizationId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "permissions";

-- DropTable
DROP TABLE "UserInvitation";
