/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AuthorizedPersonnel` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AuthorizedPersonnel` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `tag` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `Attachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerGroup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_CustomerGroups` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[branchId,productId]` on the table `BranchProduct` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branchProductId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchProductId` to the `Sale` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerGroup" DROP CONSTRAINT "CustomerGroup_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerTag" DROP CONSTRAINT "CustomerTag_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerTag" DROP CONSTRAINT "CustomerTag_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "_CustomerGroups" DROP CONSTRAINT "_CustomerGroups_A_fkey";

-- DropForeignKey
ALTER TABLE "_CustomerGroups" DROP CONSTRAINT "_CustomerGroups_B_fkey";

-- AlterTable
ALTER TABLE "AuthorizedPersonnel" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "BranchProduct" ADD COLUMN     "tag" "ProductTag";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "branchProductId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "stock",
DROP COLUMN "tag";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "branchProductId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "branchProductId" TEXT;

-- DropTable
DROP TABLE "Attachment";

-- DropTable
DROP TABLE "CustomerGroup";

-- DropTable
DROP TABLE "CustomerTag";

-- DropTable
DROP TABLE "_CustomerGroups";

-- DropEnum
DROP TYPE "AttachmentType";

-- CreateIndex
CREATE UNIQUE INDEX "BranchProduct_branchId_productId_key" ON "BranchProduct"("branchId", "productId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchProductId_fkey" FOREIGN KEY ("branchProductId") REFERENCES "BranchProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_branchProductId_fkey" FOREIGN KEY ("branchProductId") REFERENCES "BranchProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchProductId_fkey" FOREIGN KEY ("branchProductId") REFERENCES "BranchProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
