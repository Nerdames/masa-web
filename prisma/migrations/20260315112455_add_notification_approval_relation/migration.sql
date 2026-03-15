-- DropForeignKey
ALTER TABLE "NotificationRecipient" DROP CONSTRAINT "NotificationRecipient_notificationId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationRecipient" DROP CONSTRAINT "NotificationRecipient_personnelId_fkey";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "approvalId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_approvalId_idx" ON "Notification"("approvalId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
