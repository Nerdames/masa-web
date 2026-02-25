/*
  Warnings:

  - A unique constraint covering the columns `[scope,category,key,organizationId,branchId,personnelId,target]` on the table `Preference` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Preference_category_idx";

-- DropIndex
DROP INDEX "Preference_scope_key_organizationId_branchId_personnelId_ta_key";

-- AlterTable
ALTER TABLE "AuthorizedPersonnel" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lockoutUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuthorizedPersonnel_branchId_idx" ON "AuthorizedPersonnel"("branchId");

-- CreateIndex
CREATE INDEX "AuthorizedPersonnel_lastLogin_idx" ON "AuthorizedPersonnel"("lastLogin");

-- CreateIndex
CREATE INDEX "AuthorizedPersonnel_lastActivityAt_idx" ON "AuthorizedPersonnel"("lastActivityAt");

-- CreateIndex
CREATE INDEX "AuthorizedPersonnel_failedLoginAttempts_idx" ON "AuthorizedPersonnel"("failedLoginAttempts");

-- CreateIndex
CREATE INDEX "AuthorizedPersonnel_lockoutUntil_idx" ON "AuthorizedPersonnel"("lockoutUntil");

-- CreateIndex
CREATE INDEX "Preference_organizationId_category_idx" ON "Preference"("organizationId", "category");

-- CreateIndex
CREATE INDEX "Preference_organizationId_key_idx" ON "Preference"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Preference_organizationId_key_target_idx" ON "Preference"("organizationId", "key", "target");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_scope_category_key_organizationId_branchId_perso_key" ON "Preference"("scope", "category", "key", "organizationId", "branchId", "personnelId", "target");
