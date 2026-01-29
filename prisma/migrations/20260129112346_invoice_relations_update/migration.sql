/*
  Warnings:

  - You are about to drop the column `paid` on the `Invoice` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "paid",
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_paidAt_idx" ON "Invoice"("paidAt");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Sale_orderId_idx" ON "Sale"("orderId");

-- CreateIndex
CREATE INDEX "Sale_invoiceId_idx" ON "Sale"("invoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
