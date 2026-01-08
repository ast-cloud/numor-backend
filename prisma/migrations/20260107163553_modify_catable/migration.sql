/*
  Warnings:

  - Added the required column `documentUrl` to the `ca_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `ca_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ca_profiles" ADD COLUMN     "documentUrl" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;
