-- AlterTable
ALTER TABLE "BranchProduct" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BranchProduct_deletedAt_idx" ON "BranchProduct"("deletedAt");
