/*
  Warnings:

  - You are about to alter the column `totalSpent` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to drop the column `organizationId` on the `DraftSaleItem` table. All the data in the column will be lost.
  - You are about to drop the column `read` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `organizationId` on the `OrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[organizationId,name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,name]` on the table `CustomerGroup` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,branchId,customerId]` on the table `CustomerOrderSummary` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customerId,name]` on the table `CustomerTag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,branchId,name]` on the table `FinanceAccount` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[invoiceId,branchProductId]` on the table `Sale` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CustomerGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CustomerTag` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `DraftSaleItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `StockTransferItem` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `Transaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PAYMENT', 'REFUND', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "POSSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- DropForeignKey
ALTER TABLE "AuthAccount" DROP CONSTRAINT "AuthAccount_personnelId_fkey";

-- DropForeignKey
ALTER TABLE "DraftSaleItem" DROP CONSTRAINT "DraftSaleItem_draftSaleId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_personnelId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransferItem" DROP CONSTRAINT "StockTransferItem_stockTransferId_fkey";

-- DropIndex
DROP INDEX "FinanceAccount_organizationId_name_key";

-- DropIndex
DROP INDEX "Notification_read_idx";

-- AlterTable
ALTER TABLE "AuthorizedPersonnel" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'CASHIER';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT,
ALTER COLUMN "totalSpent" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "CustomerGroup" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CustomerTag" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "DraftSale" ADD COLUMN     "posSessionId" TEXT;

-- AlterTable
ALTER TABLE "DraftSaleItem" DROP COLUMN "organizationId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "read";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "organizationId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "posSessionId" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "orderItemId" TEXT,
ADD COLUMN     "saleId" TEXT,
ADD COLUMN     "stockTransferItemId" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "StockTransferItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "type",
ADD COLUMN     "type" "TransactionType" NOT NULL;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "POSSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2),
    "status" "POSSessionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "POSSession_branchId_idx" ON "POSSession"("branchId");

-- CreateIndex
CREATE INDEX "POSSession_cashierId_idx" ON "POSSession"("cashierId");

-- CreateIndex
CREATE INDEX "POSSession_cashierId_status_idx" ON "POSSession"("cashierId", "status");

-- CreateIndex
CREATE INDEX "POSSession_status_idx" ON "POSSession"("status");

-- CreateIndex
CREATE INDEX "Branch_organizationId_deletedAt_idx" ON "Branch"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "BranchProduct_organizationId_deletedAt_idx" ON "BranchProduct"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "BranchProduct_branchId_deletedAt_idx" ON "BranchProduct"("branchId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_name_key" ON "Category"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_deletedAt_idx" ON "Customer"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroup_organizationId_name_key" ON "CustomerGroup"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderSummary_organizationId_branchId_customerId_key" ON "CustomerOrderSummary"("organizationId", "branchId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_customerId_name_key" ON "CustomerTag"("customerId", "name");

-- CreateIndex
CREATE INDEX "DraftSale_cashierId_idx" ON "DraftSale"("cashierId");

-- CreateIndex
CREATE INDEX "DraftSale_cashierId_posSessionId_idx" ON "DraftSale"("cashierId", "posSessionId");

-- CreateIndex
CREATE INDEX "DraftSaleItem_draftSaleId_idx" ON "DraftSaleItem"("draftSaleId");

-- CreateIndex
CREATE INDEX "DraftSaleItem_branchProductId_idx" ON "DraftSaleItem"("branchProductId");

-- CreateIndex
CREATE INDEX "DraftSaleItem_productId_idx" ON "DraftSaleItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_organizationId_branchId_name_key" ON "FinanceAccount"("organizationId", "branchId", "name");

-- CreateIndex
CREATE INDEX "Order_salespersonId_idx" ON "Order"("salespersonId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Payment_cashierId_idx" ON "Payment"("cashierId");

-- CreateIndex
CREATE INDEX "Payment_updatedById_idx" ON "Payment"("updatedById");

-- CreateIndex
CREATE INDEX "Payment_receiptId_idx" ON "Payment"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_organizationId_deletedAt_idx" ON "Product"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Receipt_updatedById_idx" ON "Receipt"("updatedById");

-- CreateIndex
CREATE INDEX "Sale_organizationId_deletedAt_idx" ON "Sale"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Sale_organizationId_createdAt_idx" ON "Sale"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_branchId_createdAt_idx" ON "Sale"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_cashierId_createdAt_idx" ON "Sale"("cashierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceId_branchProductId_key" ON "Sale"("invoiceId", "branchProductId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_deletedAt_idx" ON "StockMovement"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "StockMovement_branchProductId_type_idx" ON "StockMovement"("branchProductId", "type");

-- CreateIndex
CREATE INDEX "StockMovement_branchProductId_createdAt_idx" ON "StockMovement"("branchProductId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_updatedById_idx" ON "StockMovement"("updatedById");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- AddForeignKey
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSale" ADD CONSTRAINT "DraftSale_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "POSSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSaleItem" ADD CONSTRAINT "DraftSaleItem_draftSaleId_fkey" FOREIGN KEY ("draftSaleId") REFERENCES "DraftSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockTransferItemId_fkey" FOREIGN KEY ("stockTransferItemId") REFERENCES "StockTransferItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "POSSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
