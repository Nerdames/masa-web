/*
  Warnings:

  - The values [DRAFT] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [PENDING,PROCESSING,COMPLETED,RETURNED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `tag` on the `BranchProduct` table. All the data in the column will be lost.
  - You are about to drop the column `closedAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paidAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paidById` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `tax` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `voidedAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `balance` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paidAmount` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paymentTerms` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `personnelId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `attendantId` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `paymentType` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `tax` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `sourceBranchId` on the `StockMovement` table. All the data in the column will be lost.
  - You are about to drop the column `targetBranchId` on the `StockMovement` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orderId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `balance` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issuedById` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salespersonId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `Sale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cashierId` to the `Sale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `Sale` table without a default value. This is not possible if the table is not empty.
  - Made the column `invoiceId` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `branchId` on table `StockMovement` required. This step will fail if there are existing NULL values in that column.
  - Made the column `personnelId` on table `StockMovement` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'POS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOIDED');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'ISSUED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_paidById_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_personnelId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_attendantId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_orderId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_branchId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_personnelId_fkey";

-- DropIndex
DROP INDEX "Invoice_issuedAt_idx";

-- DropIndex
DROP INDEX "Invoice_orderId_idx";

-- DropIndex
DROP INDEX "Invoice_paidAt_idx";

-- DropIndex
DROP INDEX "Invoice_status_idx";

-- DropIndex
DROP INDEX "Sale_branchProductId_idx";

-- DropIndex
DROP INDEX "Sale_createdAt_idx";

-- DropIndex
DROP INDEX "Sale_invoiceId_idx";

-- DropIndex
DROP INDEX "Sale_orderId_idx";

-- DropIndex
DROP INDEX "Sale_organizationId_idx";

-- DropIndex
DROP INDEX "Sale_productId_idx";

-- DropIndex
DROP INDEX "StockMovement_branchId_idx";

-- DropIndex
DROP INDEX "StockMovement_createdAt_idx";

-- DropIndex
DROP INDEX "StockMovement_personnelId_idx";

-- DropIndex
DROP INDEX "StockMovement_type_idx";

-- AlterTable
ALTER TABLE "AuthorizedPersonnel" ADD COLUMN     "isOrgOwner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BranchProduct" DROP COLUMN "tag";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "closedAt",
DROP COLUMN "createdAt",
DROP COLUMN "discount",
DROP COLUMN "paidAt",
DROP COLUMN "paidById",
DROP COLUMN "tax",
DROP COLUMN "updatedAt",
DROP COLUMN "voidedAt",
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "branchId" TEXT NOT NULL,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "issuedById" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "balance",
DROP COLUMN "dueDate",
DROP COLUMN "paidAmount",
DROP COLUMN "paymentTerms",
DROP COLUMN "personnelId",
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "salespersonId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "price",
ADD COLUMN     "unitPrice" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "attendantId",
DROP COLUMN "discount",
DROP COLUMN "orderId",
DROP COLUMN "paymentType",
DROP COLUMN "tax",
ADD COLUMN     "branchId" TEXT NOT NULL,
ADD COLUMN     "cashierId" TEXT NOT NULL,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "unitPrice" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "invoiceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "note",
DROP COLUMN "sourceBranchId",
DROP COLUMN "targetBranchId",
ADD COLUMN     "referenceId" TEXT,
ALTER COLUMN "branchId" SET NOT NULL,
ALTER COLUMN "personnelId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- DropEnum
DROP TYPE "ProductTag";

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "deletedAt" TIMESTAMP(3),
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchProductId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_saleId_key" ON "Receipt"("saleId");

-- CreateIndex
CREATE INDEX "ActivityLog_organizationId_idx" ON "ActivityLog"("organizationId");

-- CreateIndex
CREATE INDEX "ActivityLog_branchId_idx" ON "ActivityLog"("branchId");

-- CreateIndex
CREATE INDEX "ActivityLog_personnelId_idx" ON "ActivityLog"("personnelId");

-- CreateIndex
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");

-- CreateIndex
CREATE INDEX "BranchAssignment_personnelId_idx" ON "BranchAssignment"("personnelId");

-- CreateIndex
CREATE INDEX "BranchAssignment_branchId_idx" ON "BranchAssignment"("branchId");

-- CreateIndex
CREATE INDEX "Category_organizationId_idx" ON "Category"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerGroup_organizationId_idx" ON "CustomerGroup"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerOrderSummary_organizationId_idx" ON "CustomerOrderSummary"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerOrderSummary_branchId_idx" ON "CustomerOrderSummary"("branchId");

-- CreateIndex
CREATE INDEX "CustomerOrderSummary_customerId_idx" ON "CustomerOrderSummary"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTag_organizationId_idx" ON "CustomerTag"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerTag_customerId_idx" ON "CustomerTag"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_branchId_idx" ON "Notification"("branchId");

-- CreateIndex
CREATE INDEX "Notification_personnelId_idx" ON "Notification"("personnelId");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "StockMovement_referenceId_idx" ON "StockMovement"("referenceId");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchProductId_fkey" FOREIGN KEY ("branchProductId") REFERENCES "BranchProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
