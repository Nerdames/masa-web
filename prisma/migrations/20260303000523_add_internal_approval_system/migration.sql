/*
  Warnings:

  - A unique constraint covering the columns `[personnelId,branchId]` on the table `BranchAssignment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "CriticalAction" ADD VALUE 'USER_LOCK_UNLOCK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_DECISION';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "approvalRequestId" TEXT;

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "rejectionNote" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "targetRole" "Role";

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "approvalRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchAssignment_personnelId_branchId_key" ON "BranchAssignment"("personnelId", "branchId");

-- CreateIndex
CREATE INDEX "Notification_targetRole_idx" ON "Notification"("targetRole");

-- CreateIndex
CREATE INDEX "StockMovement_approvalRequestId_idx" ON "StockMovement"("approvalRequestId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
