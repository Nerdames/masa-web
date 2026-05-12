-- CreateEnum
CREATE TYPE "Resource" AS ENUM ('INVOICE', 'STOCK', 'PRODUCT', 'CUSTOMER', 'EXPENSE', 'PROCUREMENT', 'VENDOR', 'REPORT', 'AUDIT', 'SETTINGS', 'BRANCH', 'PERSONNEL', 'FINANCE');

-- CreateTable
CREATE TABLE "ResourcePermission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "resource" "Resource" NOT NULL,
    "actions" "PermissionAction"[] DEFAULT ARRAY[]::"PermissionAction"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourcePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourcePermission_organizationId_idx" ON "ResourcePermission"("organizationId");

-- CreateIndex
CREATE INDEX "ResourcePermission_role_idx" ON "ResourcePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePermission_organizationId_resource_role_key" ON "ResourcePermission"("organizationId", "resource", "role");

-- AddForeignKey
ALTER TABLE "ResourcePermission" ADD CONSTRAINT "ResourcePermission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
