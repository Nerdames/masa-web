/*
  Warnings:

  - You are about to drop the column `personnelId` on the `ActivityLog` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[hash]` on the table `ActivityLog` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_personnelId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationSetting" DROP CONSTRAINT "NotificationSetting_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationSetting" DROP CONSTRAINT "NotificationSetting_personnelId_fkey";

-- DropIndex
DROP INDEX "ActivityLog_critical_idx";

-- DropIndex
DROP INDEX "ActivityLog_deletedAt_idx";

-- DropIndex
DROP INDEX "ActivityLog_personnelId_idx";

-- DropIndex
DROP INDEX "Notification_actionTrigger_idx";

-- DropIndex
DROP INDEX "Notification_deletedAt_idx";

-- AlterTable
ALTER TABLE "ActivityLog" DROP COLUMN "personnelId",
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorRole" "Role",
ADD COLUMN     "actorType" "ActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT 'System generated log',
ADD COLUMN     "hash" TEXT,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "severity" "Severity" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLog_hash_key" ON "ActivityLog"("hash");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");

-- CreateIndex
CREATE INDEX "ActivityLog_requestId_idx" ON "ActivityLog"("requestId");

-- CreateIndex
CREATE INDEX "ActivityLog_hash_idx" ON "ActivityLog"("hash");

-- CreateIndex
CREATE INDEX "Notification_activityLogId_idx" ON "Notification"("activityLogId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
