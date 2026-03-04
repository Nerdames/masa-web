/*
  Warnings:

  - You are about to drop the column `personnelId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `read` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `readBy` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `targetRole` on the `Notification` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_personnelId_fkey";

-- DropIndex
DROP INDEX "Notification_branchId_idx";

-- DropIndex
DROP INDEX "Notification_organizationId_idx";

-- DropIndex
DROP INDEX "Notification_personnelId_idx";

-- DropIndex
DROP INDEX "Notification_targetRole_idx";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "personnelId",
DROP COLUMN "read",
DROP COLUMN "readBy",
DROP COLUMN "targetRole",
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "Preference" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationRecipient_personnelId_readAt_idx" ON "NotificationRecipient"("personnelId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_personnelId_key" ON "NotificationRecipient"("notificationId", "personnelId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_personnelId_event_key" ON "NotificationSetting"("personnelId", "event");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_sourceId_idx" ON "Notification"("sourceId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
