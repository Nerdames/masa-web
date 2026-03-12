/*
  Warnings:

  - A unique constraint covering the columns `[personnelId,isPrimary]` on the table `BranchAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BranchAssignment" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "one_primary_branch_per_personnel" ON "BranchAssignment"("personnelId", "isPrimary");
