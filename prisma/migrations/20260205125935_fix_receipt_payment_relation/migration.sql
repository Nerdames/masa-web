/*
  Warnings:

  - The values [PENDING] on the enum `SaleStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[paymentId]` on the table `Receipt` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PreferenceScope" AS ENUM ('USER', 'BRANCH', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PreferenceCategory" AS ENUM ('UI', 'LAYOUT', 'TABLE', 'NOTIFICATION', 'SYSTEM');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'DRAFT';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'FULFILLED';

-- AlterEnum
BEGIN;
CREATE TYPE "SaleStatus_new" AS ENUM ('COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE "SaleStatus_new" USING ("status"::text::"SaleStatus_new");
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
DROP TYPE "public"."SaleStatus_old";
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'COMPLETED';
COMMIT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "checkHash" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "subtotal" DOUBLE PRECISION,
ADD COLUMN     "tax" DOUBLE PRECISION DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "status" SET DEFAULT 'COMPLETED';

-- CreateTable
CREATE TABLE "Preference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "personnelId" TEXT,
    "scope" "PreferenceScope" NOT NULL,
    "category" "PreferenceCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Preference_organizationId_idx" ON "Preference"("organizationId");

-- CreateIndex
CREATE INDEX "Preference_branchId_idx" ON "Preference"("branchId");

-- CreateIndex
CREATE INDEX "Preference_personnelId_idx" ON "Preference"("personnelId");

-- CreateIndex
CREATE INDEX "Preference_scope_idx" ON "Preference"("scope");

-- CreateIndex
CREATE INDEX "Preference_category_idx" ON "Preference"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_scope_key_organizationId_branchId_personnelId_key" ON "Preference"("scope", "key", "organizationId", "branchId", "personnelId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_branchId_status_idx" ON "Invoice"("organizationId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Order_organizationId_branchId_status_idx" ON "Order"("organizationId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_receivedAt_idx" ON "Payment"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_invoiceId_idx" ON "Receipt"("invoiceId");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Sale_invoiceId_idx" ON "Sale"("invoiceId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_branchId_idx" ON "Sale"("organizationId", "branchId");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
