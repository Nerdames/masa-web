-- AlterTable
ALTER TABLE "BranchProduct" ADD COLUMN     "lastRestockedAt" TIMESTAMP(3),
ADD COLUMN     "lastSoldAt" TIMESTAMP(3),
ADD COLUMN     "safetyStock" INTEGER DEFAULT 0,
ADD COLUMN     "unit" TEXT DEFAULT 'pcs';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "tax" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "readBy" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentTerms" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "tax" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "attendantId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "tax" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "sourceBranchId" TEXT,
ADD COLUMN     "targetBranchId" TEXT;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
