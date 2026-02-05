/*
  Warnings:

  - A unique constraint covering the columns `[scope,key,organizationId,branchId,personnelId,target]` on the table `Preference` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Preference_scope_key_organizationId_branchId_personnelId_key";

-- AlterTable
ALTER TABLE "Preference" ADD COLUMN     "target" TEXT;

-- CreateIndex
CREATE INDEX "Preference_target_idx" ON "Preference"("target");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_scope_key_organizationId_branchId_personnelId_ta_key" ON "Preference"("scope", "key", "organizationId", "branchId", "personnelId", "target");
