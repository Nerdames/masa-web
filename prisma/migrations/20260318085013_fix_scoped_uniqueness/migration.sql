/*
  Warnings:

  - The values [WARNING,ERROR,APPROVAL_REQUIRED,APPROVAL_DECISION] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `enabled` on the `NotificationSetting` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[organizationId,staffCode]` on the table `AuthorizedPersonnel` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,invoiceNumber]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,receiptNumber]` on the table `Receipt` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,transferNumber]` on the table `StockTransfer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('SECURITY', 'INVENTORY', 'APPROVAL', 'SYSTEM', 'TRANSACTIONAL', 'INFO');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TABLE "NotificationSetting" ALTER COLUMN "notificationType" TYPE "NotificationType_new" USING ("notificationType"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropIndex
DROP INDEX "AuthorizedPersonnel_staffCode_key";

-- DropIndex
DROP INDEX "Notification_approvalId_idx";

-- DropIndex
DROP INDEX "Product_barcode_key";

-- AlterTable
ALTER TABLE "AuthorizedPersonnel" ADD COLUMN     "requiresPasswordChange" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceNumber" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionTrigger" "CriticalAction",
ADD COLUMN     "activityLogId" TEXT;

-- AlterTable
ALTER TABLE "NotificationSetting" DROP COLUMN "enabled",
ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderNumber" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "receiptNumber" TEXT;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "transferNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedPersonnel_organizationId_staffCode_key" ON "AuthorizedPersonnel"("organizationId", "staffCode");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Notification_actionTrigger_idx" ON "Notification"("actionTrigger");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_organizationId_receiptNumber_key" ON "Receipt"("organizationId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_organizationId_transferNumber_key" ON "StockTransfer"("organizationId", "transferNumber");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_activityLogId_fkey" FOREIGN KEY ("activityLogId") REFERENCES "ActivityLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
